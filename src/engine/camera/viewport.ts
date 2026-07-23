/**
 * Owns the `<canvas>` a {@link import("../render/renderer-2d").default} draws
 * into and keeps its backing-store size synced to the container it is mounted
 * in. All window-relative reads (`devicePixelRatio`, `ResizeObserver`) come from
 * the **owning** document's window, not the global one, so a canvas mounted in a
 * satellite editor window on a different monitor sizes to that monitor's DPR.
 */
export default class Viewport {
	private canvas: HTMLCanvasElement;
	private container: HTMLElement | null = null;
	private observer: ResizeObserver | null = null;

	/**
	 * @param ownerDocument document the initial canvas is created in; defaults to
	 * the global `document`. A cross-window move recreates the canvas in the
	 * destination document via {@link reattach}, so the initial owner only needs
	 * to be the document the view first mounts in.
	 */
	constructor(ownerDocument: Document = document) {
		this.canvas = ownerDocument.createElement("canvas");
		this.canvas.tabIndex = 0;
	}

	get element(): HTMLCanvasElement {
		return this.canvas;
	}

	get width(): number {
		return this.canvas.width;
	}

	get height(): number {
		return this.canvas.height;
	}

	resize(w: number, h: number): void {
		this.canvas.width = w;
		this.canvas.height = h;
	}

	/**
	 * Mounts the canvas into `container`, sized to fill it, and keeps its backing
	 * store synced to the container's size via a `ResizeObserver`. The observer
	 * and `devicePixelRatio` are taken from `container`'s **owning window**, so
	 * DPR and resize behaviour are correct in a satellite window on a different
	 * monitor. Observes the container rather than the canvas so backing-store
	 * updates can't feed back into the observer. Returns a detach function that
	 * removes only the canvas this call mounted.
	 */
	attach(container: HTMLElement): () => void {
		const canvas = this.canvas;
		canvas.style.display = "block";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		container.appendChild(canvas);
		this.container = container;

		const view = container.ownerDocument.defaultView ?? window;

		const resizeCanvas = () => {
			const rect = canvas.getBoundingClientRect();
			const dpr = view.devicePixelRatio || 1;
			const w = Math.round(rect.width * dpr);
			const h = Math.round(rect.height * dpr);
			if (canvas.width !== w || canvas.height !== h) {
				this.resize(w, h);
			}
		};

		resizeCanvas();

		const observer = new view.ResizeObserver(resizeCanvas);
		observer.observe(container);
		this.observer = observer;

		return () => {
			observer.disconnect();
			if (this.observer === observer) {
				this.observer = null;
			}
			canvas.remove();
			if (this.container === container) {
				this.container = null;
			}
		};
	}

	/**
	 * Move this viewport to `newContainer`, which may live in a different
	 * document. A WebGL canvas cannot survive `adoptNode` between documents, so
	 * this creates a **fresh** `<canvas>` in `newContainer`'s document, carries
	 * over the backing-store size and styling, mounts it, and starts observing
	 * against the new window. The previous canvas (and its dead GL context) is
	 * removed from the old container.
	 *
	 * After `reattach`, {@link element} returns the new canvas with **no GL
	 * context**. The caller must rebuild the renderer against it (see
	 * `Renderer2D.rebuild`) and rebind any input listeners that were attached to
	 * the old element. Returns a detach function for the new mount; any detach
	 * function from a prior {@link attach}/`reattach` is now stale and should be
	 * discarded.
	 *
	 * Pass `canvas` to adopt a pre-created canvas (one already pre-warmed with a
	 * GL context in the destination document, see `Renderer2D.prewarm`) instead
	 * of minting a fresh one, so `Renderer2D.rebuild` can reuse its pre-baked GPU
	 * state on the drop frame. The supplied canvas must belong to
	 * `newContainer`'s document; its styling and backing-store size are carried
	 * over from the old canvas either way.
	 *
	 * @example
	 * const detach = viewport.reattach(destContainer);
	 * renderer.rebuild(); // reacquires the GL context from viewport.element
	 */
	reattach(
		newContainer: HTMLElement,
		canvas?: HTMLCanvasElement,
	): () => void {
		this.observer?.disconnect();
		this.observer = null;
		const old = this.canvas;
		old.remove();

		const next =
			canvas ?? newContainer.ownerDocument.createElement("canvas");
		next.tabIndex = old.tabIndex;
		next.style.cssText = old.style.cssText;
		next.className = old.className;
		next.width = old.width;
		next.height = old.height;
		this.canvas = next;

		return this.attach(newContainer);
	}
}
