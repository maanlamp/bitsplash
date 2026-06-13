import { loadImage } from "../../engine/load";
import { Subscribable } from "../subscribable";
import { type BlendMode, DEFAULT_BLEND } from "./blend-modes";

type Layer = {
	id: string;
	name: string;
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	blend: BlendMode;
	opacity: number;
	visible: boolean;
};

export type LayerView = Readonly<{
	id: string;
	name: string;
	canvas: HTMLCanvasElement;
	blend: BlendMode;
	opacity: number;
	visible: boolean;
}>;

export type StrokeSnapshot = Readonly<{
	layerId: string;
	data: ImageData;
}>;

type LayerState = Readonly<{
	id: string;
	name: string;
	blend: BlendMode;
	opacity: number;
	visible: boolean;
	data: ImageData;
}>;

export type DocState = Readonly<{
	layers: ReadonlyArray<LayerState>;
	activeId: string;
}>;

const createCanvas = (
	width: number,
	height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("2D context unavailable.");
	}
	ctx.imageSmoothingEnabled = false;
	return { canvas, ctx };
};

export class SpriteDocument extends Subscribable {
	readonly width: number;
	readonly height: number;
	private composite: HTMLCanvasElement;
	private compositeCtx: CanvasRenderingContext2D;
	private _layers: Layer[] = [];
	private _activeId: string;
	private _dirty = false;

	constructor(width: number, height: number) {
		super();
		this.width = width;
		this.height = height;
		const { canvas, ctx } = createCanvas(width, height);
		this.composite = canvas;
		this.compositeCtx = ctx;
		const base = this.makeLayer("Layer 1");
		this._layers = [base];
		this._activeId = base.id;
		this.recomposite();
	}

	static async load(url: string): Promise<SpriteDocument> {
		const image = await loadImage(url);
		const doc = new SpriteDocument(
			image.naturalWidth,
			image.naturalHeight,
		);
		doc.activeLayer.ctx.drawImage(image, 0, 0);
		doc.recomposite();
		return doc;
	}

	get canvas(): HTMLCanvasElement {
		return this.composite;
	}

	get dirty(): boolean {
		return this._dirty;
	}

	get layers(): ReadonlyArray<LayerView> {
		return this._layers.map((layer) => ({
			id: layer.id,
			name: layer.name,
			canvas: layer.canvas,
			blend: layer.blend,
			opacity: layer.opacity,
			visible: layer.visible,
		}));
	}

	get activeLayerId(): string {
		return this._activeId;
	}

	setActiveLayer(id: string): void {
		if (
			id === this._activeId ||
			!this._layers.some((l) => l.id === id)
		) {
			return;
		}
		this._activeId = id;
		this.notify();
	}

	addLayer(): string {
		const layer = this.makeLayer(`Layer ${this._layers.length + 1}`);
		this._layers.push(layer);
		this._activeId = layer.id;
		this.recomposite();
		this.markDirty();
		return layer.id;
	}

	deleteLayer(id: string): void {
		if (this._layers.length <= 1) {
			return;
		}
		const index = this._layers.findIndex((l) => l.id === id);
		if (index < 0) {
			return;
		}
		this._layers.splice(index, 1);
		if (this._activeId === id) {
			const next =
				this._layers[Math.min(index, this._layers.length - 1)];
			this._activeId = next!.id;
		}
		this.recomposite();
		this.markDirty();
	}

	setLayerOrder(ids: ReadonlyArray<string>): void {
		if (ids.length !== this._layers.length) {
			return;
		}
		const next = ids.map((id) =>
			this._layers.find((l) => l.id === id),
		);
		if (next.some((l) => !l)) {
			return;
		}
		const reordered = next as Layer[];
		if (reordered.every((l, i) => l === this._layers[i])) {
			return;
		}
		this._layers = reordered;
		this.recomposite();
		this.markDirty();
	}

	renameLayer(id: string, name: string): void {
		const layer = this._layers.find((l) => l.id === id);
		if (!layer || layer.name === name) {
			return;
		}
		layer.name = name;
		this.markDirty();
	}

	setBlend(id: string, blend: BlendMode): void {
		const layer = this._layers.find((l) => l.id === id);
		if (!layer || layer.blend === blend) {
			return;
		}
		layer.blend = blend;
		this.recomposite();
		this.markDirty();
	}

	setOpacity(id: string, opacity: number): void {
		const layer = this._layers.find((l) => l.id === id);
		if (!layer || layer.opacity === opacity) {
			return;
		}
		layer.opacity = opacity;
		this.recomposite();
		this.markDirty();
	}

	setVisible(id: string, visible: boolean): void {
		const layer = this._layers.find((l) => l.id === id);
		if (!layer || layer.visible === visible) {
			return;
		}
		layer.visible = visible;
		this.recomposite();
		this.markDirty();
	}

	captureState(): DocState {
		return {
			activeId: this._activeId,
			layers: this._layers.map((layer) => ({
				id: layer.id,
				name: layer.name,
				blend: layer.blend,
				opacity: layer.opacity,
				visible: layer.visible,
				data: layer.ctx.getImageData(0, 0, this.width, this.height),
			})),
		};
	}

	restoreState(state: DocState): void {
		this._layers = state.layers.map((entry) => {
			const layer = this.makeLayer(entry.name, entry.id);
			layer.blend = entry.blend;
			layer.opacity = entry.opacity;
			layer.visible = entry.visible;
			layer.ctx.putImageData(entry.data, 0, 0);
			return layer;
		});
		this._activeId =
			state.layers.find((l) => l.id === state.activeId)?.id ??
			this._layers[0]!.id;
		this.recomposite();
		this.markDirty();
	}

	setPixel(x: number, y: number, css: string): void {
		if (!this.inBounds(x, y)) {
			return;
		}
		const ctx = this.activeLayer.ctx;
		ctx.fillStyle = css;
		ctx.fillRect(x, y, 1, 1);
		this.recomposite();
		this.markDirty();
	}

	erasePixel(x: number, y: number): void {
		if (!this.inBounds(x, y)) {
			return;
		}
		this.activeLayer.ctx.clearRect(x, y, 1, 1);
		this.recomposite();
		this.markDirty();
	}

	alphaAt(x: number, y: number): number {
		if (!this.inBounds(x, y)) {
			return 0;
		}
		return this.compositeCtx.getImageData(x, y, 1, 1).data[3] ?? 0;
	}

	colorAt(
		x: number,
		y: number,
	): [number, number, number, number] | null {
		if (!this.inBounds(x, y)) {
			return null;
		}
		const d = this.compositeCtx.getImageData(x, y, 1, 1).data;
		return [d[0]!, d[1]!, d[2]!, d[3]!];
	}

	snapshot(): StrokeSnapshot {
		const layer = this.activeLayer;
		return {
			layerId: layer.id,
			data: layer.ctx.getImageData(0, 0, this.width, this.height),
		};
	}

	restore(snapshot: StrokeSnapshot): void {
		const layer = this._layers.find((l) => l.id === snapshot.layerId);
		if (!layer) {
			return;
		}
		layer.ctx.putImageData(snapshot.data, 0, 0);
		this.recomposite();
		this.markDirty();
	}

	markSaved(): void {
		this._dirty = false;
		this.notify();
	}

	toBlob(): Promise<Blob> {
		return new Promise((resolve, reject) => {
			this.composite.toBlob((blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error("Failed to encode PNG."));
				}
			}, "image/png");
		});
	}

	private get activeLayer(): Layer {
		return (
			this._layers.find((l) => l.id === this._activeId) ??
			this._layers[0]!
		);
	}

	private makeLayer(
		name: string,
		id: string = crypto.randomUUID(),
	): Layer {
		const { canvas, ctx } = createCanvas(this.width, this.height);
		return {
			id,
			name,
			canvas,
			ctx,
			blend: DEFAULT_BLEND,
			opacity: 1,
			visible: true,
		};
	}

	private recomposite(): void {
		const ctx = this.compositeCtx;
		ctx.globalCompositeOperation = "source-over";
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, this.width, this.height);
		for (const layer of this._layers) {
			if (!layer.visible || layer.opacity <= 0) {
				continue;
			}
			ctx.globalAlpha = layer.opacity;
			ctx.globalCompositeOperation = layer.blend;
			ctx.drawImage(layer.canvas, 0, 0);
		}
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = "source-over";
	}

	private inBounds(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}

	private markDirty(): void {
		this._dirty = true;
		this.notify();
	}
}
