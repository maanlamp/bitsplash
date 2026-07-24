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
	private view: Window | null = null;
	private suspended = false;
	private savedCanvasWidth = "";
	private savedCanvasHeight = "";
	private savedCanvasPosition = "";
	private savedCanvasLeft = "";
	private savedCanvasTop = "";
	private savedCanvasTransform = "";
	private savedContainerOverflow = "";
	private savedContainerPosition = "";

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
		this.view = view;

		this.syncBackingStore();

		const observer = new view.ResizeObserver(() => {
			if (this.suspended) {
				return;
			}
			this.syncBackingStore();
		});
		observer.observe(container);
		this.observer = observer;

		return () => {
			observer.disconnect();
			if (this.observer === observer) {
				this.observer = null;
			}
			if (this.suspended && this.container === container) {
				this.restoreDisplay();
			}
			canvas.remove();
			if (this.container === container) {
				this.container = null;
				this.view = null;
			}
		};
	}

	/**
	 * Syncs the canvas backing store to the container's current size, taking DPR
	 * from the container's owning window. Reallocates the backing store (and the
	 * downstream GL render targets) only when the pixel dimensions actually
	 * change. No-op when detached.
	 */
	private syncBackingStore(): void {
		const canvas = this.canvas;
		const view = this.view;
		if (!this.container || !view) {
			return;
		}
		const rect = canvas.getBoundingClientRect();
		const dpr = view.devicePixelRatio || 1;
		const w = Math.round(rect.width * dpr);
		const h = Math.round(rect.height * dpr);
		if (canvas.width !== w || canvas.height !== h) {
			this.resize(w, h);
		}
	}

	/**
	 * Freezes the canvas backing store at its current resolution and pins the
	 * display to a fixed CSS size so a continuous resize drag (e.g. an editor
	 * splitter) stops reallocating the WebGL backing store every frame — a cost
	 * that scales with `devicePixelRatio²`. While suspended the `ResizeObserver`
	 * leaves `canvas.width/height` untouched, so the scene keeps rendering into
	 * the frozen backing store; the frame is centered in the container at true
	 * aspect (letterbox) and clipped at 1:1 when the container shrinks below it.
	 * Call {@link resumeResize} on drag release to re-sync once. No-op when
	 * detached or already suspended.
	 */
	suspendResize(): void {
		const container = this.container;
		const view = this.view;
		if (!container || !view || this.suspended) {
			return;
		}
		const canvas = this.canvas;
		const dpr = view.devicePixelRatio || 1;
		const cssWidth = canvas.width / dpr;
		const cssHeight = canvas.height / dpr;

		this.savedCanvasWidth = canvas.style.width;
		this.savedCanvasHeight = canvas.style.height;
		this.savedCanvasPosition = canvas.style.position;
		this.savedCanvasLeft = canvas.style.left;
		this.savedCanvasTop = canvas.style.top;
		this.savedCanvasTransform = canvas.style.transform;
		this.savedContainerOverflow = container.style.overflow;
		this.savedContainerPosition = container.style.position;

		if (view.getComputedStyle(container).position === "static") {
			container.style.position = "relative";
		}
		container.style.overflow = "hidden";

		canvas.style.position = "absolute";
		canvas.style.left = "50%";
		canvas.style.top = "50%";
		canvas.style.transform = "translate(-50%, -50%)";
		canvas.style.width = `${cssWidth}px`;
		canvas.style.height = `${cssHeight}px`;

		this.suspended = true;
	}

	/**
	 * Ends a {@link suspendResize} freeze: restores the canvas to fill its
	 * container and re-syncs the backing store once to the container's current
	 * size. The next animation frame (driven by the app's render loop) redraws at
	 * the true resolution. No-op when detached or not suspended.
	 */
	resumeResize(): void {
		if (!this.container || !this.suspended) {
			return;
		}
		this.restoreDisplay();
		this.syncBackingStore();
	}

	/**
	 * Reverses the style overrides applied by {@link suspendResize}, restoring the
	 * exact prior inline values on both the canvas and its container, and clears
	 * the suspended flag. Does not touch the backing store.
	 */
	private restoreDisplay(): void {
		const canvas = this.canvas;
		canvas.style.width = this.savedCanvasWidth;
		canvas.style.height = this.savedCanvasHeight;
		canvas.style.position = this.savedCanvasPosition;
		canvas.style.left = this.savedCanvasLeft;
		canvas.style.top = this.savedCanvasTop;
		canvas.style.transform = this.savedCanvasTransform;
		if (this.container) {
			this.container.style.overflow = this.savedContainerOverflow;
			this.container.style.position = this.savedContainerPosition;
		}
		this.suspended = false;
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
		if (this.suspended) {
			this.restoreDisplay();
		}
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
