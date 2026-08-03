import type { KeyframesColor } from "../animation/keyframes";
import type AssetManager from "../assets";
import type { Seconds } from "../duration";
import type { ReadonlyECS } from "../ecs";
import type { MutableRGBA } from "../render/color-resolver";
import { resolveRenderLayer } from "../render/render-layers";
import type { QuadBlend } from "../render/blend";
import type Renderer2D from "../render/renderer-2d";
import type { TileSource } from "../render/renderer-2d";
import { drawRibbon, type RibbonProfile } from "../render/ribbon";
import { type RenderContext, RenderSystem } from "../system";
import { TransformComponent } from "../transform-component";
import { ambientTime } from "../weather/ambient-clock";
import { sampleWindFrame } from "../weather/sample-wind";
import { weatherFrame } from "../weather/weather-frame";
import {
	generateRibbonPath,
	type MutableRibbonPathInput,
} from "./ribbon-path";
import type {
	VfxEmitterPart,
	VfxRibbonPart,
	VfxRibbonPulse,
} from "./vfx-def";
import type {
	VfxEffect,
	VfxPool,
	VfxRibbonBand,
	VfxStore,
} from "./vfx-store";
import { vfxWeatherInfluence } from "./vfx-weather-influence";

/**
 * Anything that names a render slot: a part, or the decal spec hanging off one.
 * Both are frozen def data, so the resolved layer memoizes against the object.
 */
type VfxSlotRef = Readonly<{ layer: string; order: number }>;

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
 *
 * Decals draw first, before any pool or band, so a smear sits under the particles
 * that made it wherever the two share a slot.
 */
export class VfxRenderSystem implements RenderSystem {
	private readonly slots = new Map<VfxSlotRef, number>();
	private readonly px: number[] = [0, 0, 0, 0];
	private readonly py: number[] = [0, 0, 0, 0];
	private readonly tint: MutableRGBA = [1, 1, 1, 1];
	private readonly pathX: number[] = [];
	private readonly pathY: number[] = [];
	/** Corner UVs, in the renderer's TL, TR, BR, BL order: always the whole image. */
	private readonly uv: ReadonlyArray<number> = [
		0, 0, 1, 0, 1, 1, 0, 1,
	];

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
		uv: this.uv,
		tint: this.tint,
		blend: "normal" as QuadBlend,
		image: undefined as TileSource | undefined,
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

	render({ renderer, ecs, assetManager }: RenderContext): void {
		this.slots.clear();
		this.drawDecals(renderer, ecs, assetManager);
		const effects = this.store.effects();
		if (effects.length === 0) {
			return;
		}
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
						ecs,
						this.slot(ecs, state.part),
						effect,
						state.part,
						state.band,
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
					assetManager,
				);
			}
		}
	}

	/**
	 * The resolved layer id for anything that names a slot — a part, or the decal
	 * spec hanging off one — memoized for the frame.
	 *
	 * Keyed by the authored object itself: parts and decal specs are frozen def
	 * data, so identity is stable for as long as the catalog is, and the lookup
	 * builds no key string per call.
	 */
	private slot(ecs: ReadonlyECS, slot: VfxSlotRef): number {
		const cached = this.slots.get(slot);
		if (cached !== undefined) {
			return cached;
		}
		const resolved = resolveRenderLayer(ecs, slot.layer, slot.order);
		this.slots.set(slot, resolved);
		return resolved;
	}

	/**
	 * Draw the decal ring: every live mark, as one oriented quad.
	 *
	 * An attached decal resolves against its host's transform here rather than
	 * being written back into the ring, so it tracks a moving body for free and a
	 * host that vanished between the update sweep and this draw simply skips a
	 * frame instead of drawing at the origin.
	 */
	private drawDecals(
		renderer: Renderer2D,
		ecs: ReadonlyECS,
		assetManager: AssetManager,
	): void {
		const ring = this.store.decals;
		if (ring.count === 0) {
			return;
		}
		for (let i = 0; i < ring.capacity; i++) {
			const spec = ring.spec[i];
			if (!spec) {
				continue;
			}
			let x = ring.x[i]!;
			let y = ring.y[i]!;
			const host = ring.host[i] ?? null;
			if (host !== null) {
				const transform = ecs.getComponent(host, TransformComponent);
				if (!transform) {
					continue;
				}
				x += transform.position.x;
				y += transform.position.y;
			}
			const image = spec.texture
				? loadedImage(assetManager, spec.texture)
				: undefined;
			if (spec.texture && !image) {
				continue;
			}
			const t = ring.age[i]! / ring.life[i]!;
			const { alpha, color } = spec.tracks;
			sampleTint(this.tint, color, t, alpha ? alpha.sample(t) : 1);
			this.corners(
				x,
				y,
				ring.halfWidth[i]!,
				ring.halfHeight[i]!,
				ring.rotation[i]!,
			);
			this.quadOpts.blend = spec.blend;
			this.quadOpts.image = image;
			renderer.drawCornerQuad(this.slot(ecs, spec), this.quadOpts);
		}
	}

	/**
	 * Draw one pool.
	 *
	 * The texture is resolved **once** for the whole pool: `getImage` is a map
	 * lookup that also kicks off a load, and doing either per particle would be
	 * both wasteful and wrong. A part whose texture has not finished loading draws
	 * nothing this frame rather than a field of white squares.
	 */
	private drawPool(
		renderer: Renderer2D,
		layer: number,
		effect: VfxEffect,
		part: VfxEmitterPart,
		pool: VfxPool,
		assetManager: AssetManager,
	): void {
		const image = part.texture
			? loadedImage(assetManager, part.texture)
			: undefined;
		if (part.texture && !image) {
			return;
		}
		const baseX = pool.local ? effect.originX : 0;
		const baseY = pool.local ? effect.originY : 0;
		const { scale, alpha, color, rotation } = part.tracks;
		this.quadOpts.blend = part.blend;
		this.quadOpts.image = image;
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
	 *
	 * Each ribbon samples the wind at its own position, so a band spread across
	 * the view leans with the gust cell passing over it rather than as one board.
	 */
	private drawBand(
		renderer: Renderer2D,
		ecs: RenderContext["ecs"],
		layer: number,
		effect: VfxEffect,
		part: VfxRibbonPart,
		band: VfxRibbonBand,
		influence: number,
		time: Seconds,
	): void {
		const baseX = band.local ? effect.originX : 0;
		const baseY = band.local ? effect.originY : 0;
		const frame = weatherFrame(ecs);
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
				part.width.base *
				(scale ? scale.sample(t) : 1) *
				pulseFactor(part.pulse, band.seed[i]!, time);
			const input = this.ribbonInput;
			input.x = baseX + band.x[i]!;
			input.y = baseY + band.y[i]!;
			input.length = band.length[i]!;
			input.age = t;
			input.seed = band.seed[i]!;
			input.wind = sampleWindFrame(frame, input.x, input.y, time);
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
 * A part's or a decal's texture, or `undefined` while it is still loading.
 *
 * `getImage` starts the load on its first miss and returns nothing until it
 * lands, so calling it every frame is both the request and the poll.
 */
const loadedImage = (
	assetManager: AssetManager,
	url: string,
): HTMLImageElement | undefined => {
	const image = assetManager.getImage(url);
	return image ? image : undefined;
};

/**
 * The pulse's width multiplier this frame: its curve read at the ribbon's phase,
 * which is the ambient clock scaled by the pulse rate and offset by the ribbon's
 * own seed. Sampled, never ticked — see {@link VfxRibbonPulse}.
 */
const pulseFactor = (
	pulse: VfxRibbonPulse | null,
	seed: number,
	time: number,
): number => {
	if (!pulse) {
		return 1;
	}
	const phase = time * pulse.rate + seed * pulse.spread;
	return pulse.curve.sample(phase - Math.floor(phase));
};

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
