export default class Viewport {
	private canvas: HTMLCanvasElement;

	constructor() {
		this.canvas = document.createElement("canvas");
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
	 * store synced to the container's size via a `ResizeObserver`. Observes the
	 * container rather than the canvas so the backing-store updates can't feed
	 * back into the observer. Returns a detach function.
	 */
	attach(container: HTMLElement): () => void {
		this.canvas.style.display = "block";
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		container.appendChild(this.canvas);

		const resizeCanvas = () => {
			const rect = this.canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const w = Math.round(rect.width * dpr);
			const h = Math.round(rect.height * dpr);
			if (this.canvas.width !== w || this.canvas.height !== h) {
				this.resize(w, h);
			}
		};

		resizeCanvas();

		const observer = new ResizeObserver(resizeCanvas);
		observer.observe(container);

		return () => {
			observer.disconnect();
			this.canvas.remove();
		};
	}
}
