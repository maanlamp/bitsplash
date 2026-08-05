import type Renderer2D from "./renderer-2d";
import type { TileSource } from "./renderer-2d";

const liveRenderers = new Set<Renderer2D>();

/**
 * Track a live {@link Renderer2D} so image / tile-array invalidation can fan out
 * to every GPU cache. Called from the renderer constructor; the editor runs
 * several renderers at once (each scene view and preview game owns one), so a
 * single invalidation must reach all of them. Idempotent.
 */
export const registerRenderer = (renderer: Renderer2D): void => {
	liveRenderers.add(renderer);
};

/**
 * Stop tracking a {@link Renderer2D}. Called from {@link Renderer2D.dispose} so
 * a closed view's renderer is not iterated after its WebGL context is gone.
 */
export const unregisterRenderer = (renderer: Renderer2D): void => {
	liveRenderers.delete(renderer);
};

/** The count of live renderers (diagnostics and tests). */
export const liveRendererCount = (): number => liveRenderers.size;

/** Every live renderer, for diagnostics that read their frame counters. */
export const eachLiveRenderer = (
	visit: (renderer: Renderer2D) => void,
): void => {
	for (const renderer of liveRenderers) {
		visit(renderer);
	}
};

/**
 * Free and drop the tile-array GPU cache entry for `source` in **every** live
 * renderer. The hot-reload path (editor save) calls this with the old backing
 * image after an {@link import("../assets").default.evict}, so no stale tile
 * texture survives in any open view; each renderer re-bakes lazily on next draw.
 *
 * @example
 * game.assetManager.evict(url);
 * invalidateTileArrayEverywhere(oldImage);
 */
export const invalidateTileArrayEverywhere = (
	source: TileSource,
): void => {
	for (const renderer of liveRenderers) {
		renderer.invalidateTileArray(source);
	}
};

/**
 * Free and drop the plain-image GPU texture for `source` in **every** live
 * renderer. The image counterpart to {@link invalidateTileArrayEverywhere}.
 *
 * @example
 * game.assetManager.evict(url);
 * invalidateImageEverywhere(oldImage);
 */
export const invalidateImageEverywhere = (
	source: TileSource,
): void => {
	for (const renderer of liveRenderers) {
		renderer.invalidateImage(source);
	}
};
