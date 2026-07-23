import type Renderer2D from "./renderer-2d";

/**
 * The slice of {@link Renderer2D} a {@link RendererResourceCache} depends on:
 * a hook to learn when the renderer is disposed, and one to learn when its GL
 * context was rebuilt (context loss recovery, or a cross-window move). Declared
 * structurally so the cache can be unit-tested without a live WebGL context.
 */
export interface DisposableRenderer {
	onDispose(listener: () => void): void;
	onContextRestored(listener: () => void): () => void;
}

/**
 * A cache of GPU resources keyed per renderer.
 *
 * With one world shared across N views (plan D13), a single render system is
 * invoked once per view, each with that view's own {@link Renderer2D}. Batches
 * baked for one renderer are meaningless on another, so each renderer keeps its
 * own entry instead of a single entry re-baked whenever the renderer changes —
 * which would thrash (re-bake every batch twice per frame) with two open views.
 * When a renderer is disposed (its view closes) its entry is destroyed and
 * dropped so caches do not leak per view.
 *
 * @example
 * const cache = new RendererResourceCache(
 *   (r) => r.createStaticBatch(),
 *   (batch) => batch.dispose(),
 * );
 * const batch = cache.get(renderer); // created once per renderer, reused after
 */
export class RendererResourceCache<
	V,
	R extends DisposableRenderer = Renderer2D,
> {
	private readonly entries = new Map<R, V>();

	constructor(
		private readonly create: (renderer: R) => V,
		private readonly destroy: (value: V) => void,
	) {}

	/** The cached value for `renderer`, created on first use and reused after. */
	get(renderer: R): V {
		const existing = this.entries.get(renderer);
		if (existing !== undefined) {
			return existing;
		}
		const value = this.create(renderer);
		this.entries.set(renderer, value);
		// Drop the entry when its renderer is disposed, and also when the
		// renderer rebuilds its GL context: the cached value holds GPU objects
		// (VAOs/VBOs) bound to the old context and is invalid across a rebuild, so
		// it is destroyed and the next `get` re-creates + re-bakes it against the
		// new context.
		let unsubscribeRestored: (() => void) | null = null;
		const drop = (): void => {
			const current = this.entries.get(renderer);
			if (current !== undefined) {
				this.destroy(current);
				this.entries.delete(renderer);
			}
			unsubscribeRestored?.();
			unsubscribeRestored = null;
		};
		renderer.onDispose(drop);
		unsubscribeRestored = renderer.onContextRestored(drop);
		return value;
	}

	/** Number of live per-renderer entries (diagnostics and tests). */
	get size(): number {
		return this.entries.size;
	}
}
