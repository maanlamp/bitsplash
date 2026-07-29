import type {
	KeyframesColor,
	MutableRGBA,
} from "../animation/keyframes";
import { resolveRenderLayer } from "../render/render-layers";
import type Renderer2D from "../render/renderer-2d";
import { type RenderContext, RenderSystem } from "../system";
import type { VfxEmitterPart } from "./vfx-def";
import type { VfxEffect, VfxPool, VfxStore } from "./vfx-store";

/**
 * Draws every particle pool in the store.
 *
 * Shares one {@link VfxStore} instance with `VfxUpdateSystem` — built by
 * `createVfxSystems` and handed to both — so what draws is exactly what was
 * simulated, with no mirror state to fall out of sync.
 *
 * Two costs are held down deliberately:
 *
 * - `resolveRenderLayer` does a full `RenderLayersComponent` query per call, so
 *   it is resolved **once per distinct `(layer, order)` slot per frame** and
 *   never inside a particle loop. The def catalog caps how many distinct slots
 *   can exist at all, because every one owns a full-viewport render target.
 * - Untextured quads are the cheap path: omitting `image` routes every particle
 *   through the renderer's shared white texture on one batch key, so thousands
 *   of contiguous solid quads collapse into a single `drawArrays`. Colour and
 *   alpha ride in a reused scratch tint tuple, so the hot loop allocates
 *   nothing.
 */
export class VfxRenderSystem implements RenderSystem {
	private readonly slots = new Map<string, number>();
	private readonly px: number[] = [0, 0, 0, 0];
	private readonly py: number[] = [0, 0, 0, 0];
	private readonly tint: MutableRGBA = [1, 1, 1, 1];

	constructor(readonly store: VfxStore) {}

	render({ renderer, ecs }: RenderContext): void {
		const effects = this.store.effects();
		if (effects.length === 0) {
			return;
		}
		this.slots.clear();
		for (const effect of effects) {
			for (let p = 0; p < effect.def.parts.length; p++) {
				const pool = effect.pools[p]!;
				if (pool.count === 0) {
					continue;
				}
				const part = effect.def.parts[p]!;
				this.drawPool(
					renderer,
					this.slot(ecs, part),
					effect,
					part,
					pool,
				);
			}
		}
	}

	/** The resolved layer id for a part, memoized for the frame. */
	private slot(
		ecs: RenderContext["ecs"],
		part: VfxEmitterPart,
	): number {
		const key = `${part.layer}#${part.order}`;
		const cached = this.slots.get(key);
		if (cached !== undefined) {
			return cached;
		}
		const resolved = resolveRenderLayer(ecs, part.layer, part.order);
		this.slots.set(key, resolved);
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
		const blend = part.blend;
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
			renderer.drawCornerQuad(layer, {
				px: this.px,
				py: this.py,
				tint: this.tint,
				blend,
			});
		}
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
