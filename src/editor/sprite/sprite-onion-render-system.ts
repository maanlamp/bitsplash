import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import {
	type OnionGhost,
	onionGhosts,
	tintPixels,
} from "./onion-skin";
import type { OnionState } from "./onion-state";
import type { SpriteDocument } from "./sprite-document";

type Surface = Readonly<{
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
}>;

/**
 * Draws onion-skin ghosts of neighbouring frames **under** the active frame.
 * For each ghost {@link onionGhosts} selects, it composites that frame with
 * {@link SpriteDocument.frameImage}, tints it toward the ghost's side colour,
 * and draws it at the ghost's opacity — so previous/next frames appear as faint
 * coloured echoes behind the current one.
 *
 * Ghost frames are cached as offscreen canvases keyed on the document version
 * and onion settings; a rebuild frees the GPU texture of any canvas that dropped
 * out of range. The ghosts are a **view overlay** — they never mutate the
 * document, the composite canvas, or saved bakes, and are not interactive.
 */
export class SpriteOnionRenderSystem implements RenderSystem {
	private cache = new Map<number, Surface>();
	private builtKey = "";

	constructor(
		private doc: SpriteDocument,
		private onion: OnionState,
		private layer: number,
	) {}

	render({ renderer }: RenderContext): void {
		const settings = this.onion.settings;
		const ghosts = onionGhosts(
			this.doc.core.activeFrameIndex,
			this.doc.core.frames.length,
			settings,
		);
		if (ghosts.length === 0) {
			return;
		}

		const key = `${this.doc.version}:${this.onion.version}`;
		if (key !== this.builtKey) {
			this.rebuild(ghosts, renderer);
			this.builtKey = key;
		}

		const w = this.doc.width;
		const h = this.doc.height;
		for (const ghost of ghosts) {
			const surface = this.cache.get(ghost.frame);
			if (!surface) {
				continue;
			}
			renderer.drawImage(this.layer, surface.canvas, {
				x: w / 2,
				y: h / 2,
				width: w,
				height: h,
				alpha: ghost.opacity,
			});
		}
	}

	private rebuild(
		ghosts: readonly OnionGhost[],
		renderer: RenderContext["renderer"],
	): void {
		const needed = new Set(ghosts.map((g) => g.frame));
		for (const [frame, surface] of this.cache) {
			if (!needed.has(frame)) {
				renderer.invalidateImage(surface.canvas);
				this.cache.delete(frame);
			}
		}
		const settings = this.onion.settings;
		for (const ghost of ghosts) {
			const tinted = tintPixels(
				this.doc.frameImage(ghost.frame),
				ghost.tint,
				settings.tintStrength,
			);
			const surface = this.surface(ghost.frame);
			const image = surface.ctx.createImageData(
				this.doc.width,
				this.doc.height,
			);
			image.data.set(tinted.data);
			surface.ctx.putImageData(image, 0, 0);
			renderer.invalidateImage(surface.canvas);
		}
	}

	private surface(frame: number): Surface {
		const w = this.doc.width;
		const h = this.doc.height;
		let surface = this.cache.get(frame);
		if (!surface) {
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext("2d", {
				willReadFrequently: true,
			});
			if (!ctx) {
				throw new Error("2D context unavailable.");
			}
			surface = { canvas, ctx };
			this.cache.set(frame, surface);
		}
		return surface;
	}
}
