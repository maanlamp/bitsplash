import type { RenderTarget } from "./render-target";
import type Renderer2D from "./renderer-2d";
import type { PresentDest } from "./renderer-2d";

const STALE_SCOPE =
	"FrameScope used after its frame ended — do not capture the scope passed to Renderer2D.frame";

/**
 * The renderer as it may be used *inside* one frame: the slice of
 * {@link Renderer2D} a frame pass needs, valid only for the duration of the
 * callback {@link Renderer2D.frame} hands it to.
 *
 * The `#gen` private field brands a scope nominally, and `frame` returns `void`
 * so one cannot be returned out. Using a scope outside any frame throws.
 *
 * One instance is reused per renderer, so escape is possible but useless rather
 * than impossible: a scope captured from frame N is the same object frame N+1
 * opens, so capture buys reaching the renderer only *during* a frame that is
 * running anyway. That is the same posture as the save tripwires — loud on the
 * mistake that actually happens (using a scope after its frame), not a compiler
 * proof.
 *
 * @example
 * renderer.frame((scope) => {
 * 	const target = scope.sceneTarget(key);
 * 	scope.composite([target], { x: 0, y: 0, w: scope.width, h: scope.height });
 * });
 */
export class FrameScope {
	readonly #owner: Renderer2D;
	#gen = 0;
	#liveGen = -1;

	constructor(owner: Renderer2D) {
		this.#owner = owner;
	}

	/**
	 * Run `cb` with this scope live and retire its generation afterwards, so a
	 * captured scope is dead the moment `cb` returns — including when it throws.
	 *
	 * Called by {@link Renderer2D.frame} and nowhere else; it is the frame
	 * bracket's inner half, not a way to start a frame.
	 */
	run(cb: (scope: FrameScope) => void): void {
		this.#liveGen = this.#gen;
		try {
			cb(this);
		} finally {
			this.#gen += 1;
		}
	}

	#live(): void {
		if (this.#liveGen !== this.#gen) {
			throw new Error(STALE_SCOPE);
		}
	}

	/** The renderer this frame draws into. */
	get renderer(): Renderer2D {
		this.#live();
		return this.#owner;
	}

	/** Drawable width in pixels. */
	get width(): number {
		this.#live();
		return this.#owner.width;
	}

	/** Drawable height in pixels. */
	get height(): number {
		this.#live();
		return this.#owner.height;
	}

	/** The render target cached under `key`, created on first use. */
	sceneTarget(key: object): RenderTarget {
		this.#live();
		return this.#owner.sceneTarget(key);
	}

	/** Blit `targets` in order into `dest` on the drawing buffer. */
	composite(
		targets: ReadonlyArray<RenderTarget>,
		dest: PresentDest,
	): void {
		this.#live();
		this.#owner.composite(targets, dest);
	}
}
