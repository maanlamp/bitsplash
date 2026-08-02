import type { KeyframesColor } from "../animation/keyframes";
import type { MutableRGBA } from "../render/color-resolver";
import { resolveRenderLayer } from "../render/render-layers";
import type Renderer2D from "../render/renderer-2d";
import type { QuadBlend } from "../render/blend";
import { drawRibbon, type RibbonProfile } from "../render/ribbon";
import { type RenderContext, RenderSystem } from "../system";
import { ambientTime } from "../weather/ambient-clock";
import { sampleWind } from "../weather/sample-wind";
import { weatherFrame } from "../weather/weather-frame";
import {
	generateRibbonPath,
	type MutableRibbonPathInput,
} from "./ribbon-path";
import type {
	VfxEmitterPart,
	VfxPart,
	VfxRibbonPart,
} from "./vfx-def";
import type {
	VfxEffect,
	VfxPool,
	VfxRibbonBand,
	VfxStore,
} from "./vfx-store";
import { vfxWeatherInfluence } from "./vfx-weather-influence";

/**
 * Draws every particle pool and ribbon band in the store.
 *
 * Shares one {@link VfxStore} instance with `VfxUpdateSystem` — built by
 * `createVfxSystems` and handed to both — so what draws is exactly what was
 * simulated, with no mirror state to fall out of sync.
 *
 * Two costs are held down deliberately:
 *
 * - The layer slot is resolved **once per part per frame**, keyed on the part
 *   object itself, and never inside a particle loop. The def catalog caps how
 *   many distinct slots can exist at all, because every one owns a
 *   full-viewport render target.
 * - Untextured quads are the cheap path: omitting `image` routes every particle
 *   through the renderer's shared white texture on one batch key, so thousands
 *   of contiguous solid quads collapse into a single `drawArrays`. Colour and
 *   alpha ride in a reused scratch tint tuple, so the hot loop allocates
 *   nothing.
 *
 * Ribbon paths are regenerated here rather than stored, into scratch arrays that
 * grow once and are reused, and the {@link RibbonProfile} handed to `drawRibbon`
 * is a single long-lived object reading scratch fields — a closure per ribbon
 * per frame would allocate through the whole band.
 */
export class VfxRenderSystem implements RenderSystem {
	private readonly slots = new Map<VfxPart, number>();
	private readonly px: number[] = [0, 0, 0, 0];
	private readonly py: number[] = [0, 0, 0, 0];
	private readonly tint: MutableRGBA = [1, 1, 1, 1];
	private readonly pathX: number[] = [];
	private readonly pathY: number[] = [];

	/** Scratch state the ribbon profile reads, written per ribbon before the draw. */
	private ribbonPart: VfxRibbonPart | null = null;
	private ribbonWidth = 0;

	/**
	 * Draw arguments reused across a whole band or pool. The geometry and tint
	 * they point at are this system's own scratch, so only the fields that vary
	 * per part are rewritten; the renderer reads them before returning.
	 */
	private readonly quadOpts = {
		px: this.px,
		py: this.py,
		tint: this.tint,
		blend: "normal" as QuadBlend,
	};

	private readonly ribbonInput: MutableRibbonPathInput = {
		x: 0,
		y: 0,
		length: 0,
		age: 0,
		seed: 0,
		wind: 0,
		time: 0,
		points: 0,
	};

	private readonly ribbonProfile: RibbonProfile = {
		width: (t: number): number => {
			const part = this.ribbonPart;
			if (!part) {
				return 0;
			}
			const { width } = part;
			return (
				this.ribbonWidth *
				taperFactor(t, width.taperHead, width.taperTail) *
				(width.profile ? width.profile.sample(t) : 1)
			);
		},
		tint: (_t: number, out: MutableRGBA): void => {
			out[0] = this.tint[0];
			out[1] = this.tint[1];
			out[2] = this.tint[2];
			out[3] = this.tint[3];
		},
	};

	private readonly ribbonOpts = {
		px: this.pathX,
		py: this.pathY,
		profile: this.ribbonProfile,
		blend: "normal" as QuadBlend,
	};

	constructor(readonly store: VfxStore) {}

	render({ renderer, ecs }: RenderContext): void {
		const effects = this.store.effects();
		if (effects.length === 0) {
			return;
		}
		this.slots.clear();
		const time = ambientTime(ecs);
		const weather = weatherFrame(ecs);
		for (const effect of effects) {
			for (const state of effect.parts) {
				if (state.kind === "ribbon") {
					if (state.band.count === 0) {
						continue;
					}
					this.drawBand(
						renderer,
						this.slot(ecs, state.part),
						effect,
						state.part,
						state.band,
						sampleWind(ecs, effect.originX, time),
						vfxWeatherInfluence(state.part.weather, weather),
						time,
					);
					continue;
				}
				if (state.pool.count === 0) {
					continue;
				}
				this.drawPool(
					renderer,
					this.slot(ecs, state.part),
					effect,
					state.part,
					state.pool,
				);
			}
		}
	}

	/** The resolved layer id for a part, memoized for the frame. */
	private slot(ecs: RenderContext["ecs"], part: VfxPart): number {
		const cached = this.slots.get(part);
		if (cached !== undefined) {
			return cached;
		}
		const resolved = resolveRenderLayer(ecs, part.layer, part.order);
		this.slots.set(part, resolved);
		return resolved;
	}

	private drawPool(
		renderer: Renderer2D,
		layer: number,
		effect: VfxEffect,
		part: VfxEmitterPart,
		pool: VfxPool,
	): void {
		const baseX = pool.local ? effect.originX : 0;
		const baseY = pool.local ? effect.originY : 0;
		const { scale, alpha, color, rotation } = part.tracks;
		this.quadOpts.blend = part.blend;
		for (let i = 0; i < pool.count; i++) {
			const t = pool.age[i]! / pool.life[i]!;
			sampleTint(this.tint, color, t, alpha ? alpha.sample(t) : 1);
			const size = pool.size[i]! * (scale ? scale.sample(t) : 1);
			const vx = pool.vx[i]!;
			const vy = pool.vy[i]!;
			const speed = part.stretch > 0 ? Math.hypot(vx, vy) : 0;
			const stretch = speed * part.stretch;
			const angle =
				stretch > 0
					? Math.atan2(vy, vx) - Math.PI / 2
					: pool.rotation[i]! + (rotation ? rotation.sample(t) : 0);
			this.corners(
				baseX + pool.x[i]!,
				baseY + pool.y[i]!,
				size / 2,
				(size + stretch) / 2,
				angle,
			);
			renderer.drawCornerQuad(layer, this.quadOpts);
		}
	}

	/**
	 * Regenerate and draw one band's ribbons.
	 *
	 * The weather influence multiplies the drawn alpha as well as the band's
	 * population, so a wind line fades in as the gale builds rather than popping
	 * into existence at full strength the frame the count reaches one.
	 */
	private drawBand(
		renderer: Renderer2D,
		layer: number,
		effect: VfxEffect,
		part: VfxRibbonPart,
		band: VfxRibbonBand,
		wind: number,
		influence: number,
		time: number,
	): void {
		const baseX = band.local ? effect.originX : 0;
		const baseY = band.local ? effect.originY : 0;
		const points = part.segments + 1;
		this.pathX.length = points;
		this.pathY.length = points;
		this.ribbonPart = part;
		this.ribbonOpts.blend = part.blend;
		const { scale, alpha, color } = part.tracks;
		for (let i = 0; i < band.count; i++) {
			const t = band.age[i]! / band.life[i]!;
			sampleTint(
				this.tint,
				color,
				t,
				(alpha ? alpha.sample(t) : 1) * influence,
			);
			this.ribbonWidth =
				part.width.base * (scale ? scale.sample(t) : 1);
			const input = this.ribbonInput;
			input.x = baseX + band.x[i]!;
			input.y = baseY + band.y[i]!;
			input.length = band.length[i]!;
			input.age = t;
			input.seed = band.seed[i]!;
			input.wind = wind;
			input.time = time;
			input.points = points;
			generateRibbonPath(part.path, input, this.pathX, this.pathY);
			drawRibbon(renderer, layer, this.ribbonOpts);
		}
		this.ribbonPart = null;
	}

	/**
	 * Write an oriented quad's four corners into the scratch arrays, in the
	 * renderer's TL, TR, BR, BL order. `halfWidth` runs across the particle's
	 * heading and `halfLength` along it, so a velocity-stretched particle grows
	 * backwards down its own path rather than fattening.
	 */
	private corners(
		x: number,
		y: number,
		halfWidth: number,
		halfLength: number,
		angle: number,
	): void {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const ux = cos * halfWidth;
		const uy = sin * halfWidth;
		const lx = -sin * halfLength;
		const ly = cos * halfLength;
		this.px[0] = x - ux - lx;
		this.py[0] = y - uy - ly;
		this.px[1] = x + ux - lx;
		this.py[1] = y + uy - ly;
		this.px[2] = x + ux + lx;
		this.py[2] = y + uy + ly;
		this.px[3] = x - ux + lx;
		this.py[3] = y - uy + ly;
	}
}

/**
 * The width multiplier at arc position `t`: full in the middle, ramping from
 * nothing over the leading `head` and trailing `tail` fractions of the length.
 * A zero fraction is a square end.
 */
const taperFactor = (t: number, head: number, tail: number): number =>
	Math.min(
		head > 0 ? Math.min(1, t / head) : 1,
		tail > 0 ? Math.min(1, (1 - t) / tail) : 1,
	);

/**
 * Fill the scratch tint with the colour track's value at `t`, alpha already
 * multiplied in.
 *
 * Baking alpha into the tuple rather than passing `alpha` to the draw is what
 * keeps the loop allocation-free: the renderer copies a tint straight into the
 * vertex buffer, but scaling one would allocate a fresh tuple per particle.
 */
const sampleTint = (
	out: MutableRGBA,
	color: KeyframesColor | null,
	t: number,
	alpha: number,
): void => {
	if (!color) {
		out[0] = 1;
		out[1] = 1;
		out[2] = 1;
		out[3] = alpha;
		return;
	}
	color.sampleInto(t, out);
	out[3] *= alpha;
};
