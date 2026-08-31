import type { BlendId } from "../../engine/sprite/bsprite-manifest";
import { loadImage } from "../../engine/load";
import { Subscribable } from "../subscribable";
import { type LayerInput, compositeFrame } from "./bake-compositor";
import { canvasNativeBlend } from "./canvas-native-blend";
import type { CelStoreDescription } from "./cel-store";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import { SpriteEditCore } from "./sprite-edit-core";
import {
	type StrokeMode,
	commitStrokeBuffer,
	stampStrokePixel,
} from "./stroke-buffer";

export type {
	LayerSnapshot,
	FrameSnapshot,
	StrokeSnapshot,
} from "./cel-store";

export type {
	SelectionBridge,
	SelectionSnapshot,
} from "./sprite-edit-core";

/**
 * A read-only view of a layer for the UI: its metadata plus a canvas that
 * reflects the layer's **active-frame** cel, kept for the layers panel's
 * thumbnail. Pixels live in cels; this canvas is a per-layer preview the
 * document maintains, not the layer's storage.
 */
export type LayerView = Readonly<{
	id: string;
	name: string;
	canvas: HTMLCanvasElement;
	blend: BlendId;
	opacity: number;
	visible: boolean;
}>;

export type CelThumb = Readonly<{
	source: PixelBuffer;
	width: number;
	height: number;
}>;

export type LayerThumb = Readonly<{
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
}>;

type Surface = {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
};

const createCanvas = (width: number, height: number): Surface => {
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

/**
 * The sprite editor's document: the **pixels-on-a-surface** half of sprite
 * editing, wrapped around the canvas-free {@link SpriteEditCore} it owns and
 * exposes as {@link core}. It owns the stable composite canvas the renderer
 * caches by, the per-layer thumbnail canvases, and the live stroke buffer with
 * its preview; every cel/layer/frame/tag/attachment edit, the editing cursor and
 * the undo choke-point hooks live on the core, and tools and commands go there.
 *
 * Invariants:
 * - `canvas` is the **same** {@link HTMLCanvasElement} for the document's whole
 *   life. Recompositing draws the active frame into it in place; a rotate resizes
 *   the same element rather than replacing it, so renderer caches keyed on the
 *   object stay valid.
 * - The composite shows the **active frame**: all visible layers' cels for the
 *   core's active frame, through blend/opacity, via the same compositor the bake
 *   uses (so preview and bake agree).
 * - Every core notification is mirrored to this document's own subscribers, and
 *   only after the canvas has caught up with it — so a subscriber that reads
 *   `canvas` on change never sees stale pixels.
 */
export class SpriteDocument extends Subscribable {
	readonly core: SpriteEditCore;
	private composite: HTMLCanvasElement;
	private compositeCtx: CanvasRenderingContext2D;
	private thumbs = new Map<string, Surface>();
	private seenPixelVersion: number;
	private seenDimensionsVersion: number;
	private strokeBuffer: PixelBuffer | null = null;
	private strokeMode: StrokeMode | null = null;
	private strokeColor = { r: 0, g: 0, b: 0 };
	private strokeOpacity = 1;
	private strokeOpacityScale = 1;
	private probedCss: string | null = null;
	private probeCtx: CanvasRenderingContext2D | null = null;

	constructor(core: SpriteEditCore) {
		super();
		this.core = core;
		this.seenPixelVersion = core.pixelVersion;
		this.seenDimensionsVersion = core.dimensionsVersion;
		const { canvas, ctx } = createCanvas(core.width, core.height);
		this.composite = canvas;
		this.compositeCtx = ctx;
		this.recomposite();
		core.subscribe(this.onCoreChanged);
	}

	/** A blank document of the given size (the new-sprite path). */
	static create(width: number, height: number): SpriteDocument {
		return new SpriteDocument(SpriteEditCore.create(width, height));
	}

	/** Load a legacy PNG as a single layer, single frame (one cel). */
	static async load(url: string): Promise<SpriteDocument> {
		const image = await loadImage(url);
		const width = image.naturalWidth;
		const height = image.naturalHeight;
		const { ctx } = createCanvas(width, height);
		ctx.drawImage(image, 0, 0);
		return new SpriteDocument(
			SpriteEditCore.fromSingleCel(
				ctx.getImageData(0, 0, width, height),
			),
		);
	}

	/**
	 * Construct a multi-frame document from a manifest-like description — the path
	 * the `.aseprite`/`.ora`/`.pdn` importers build a document with, bypassing the
	 * timeline. See {@link SpriteEditCore.fromDescription}.
	 */
	static fromDescription(desc: CelStoreDescription): SpriteDocument {
		return new SpriteDocument(SpriteEditCore.fromDescription(desc));
	}

	/** Load a `.bsprite` archive. See {@link SpriteEditCore.fromBsprite}. */
	static fromBsprite(bytes: Uint8Array): SpriteDocument {
		return new SpriteDocument(SpriteEditCore.fromBsprite(bytes));
	}

	get canvas(): HTMLCanvasElement {
		return this.composite;
	}

	get width(): number {
		return this.core.width;
	}

	get height(): number {
		return this.core.height;
	}

	/**
	 * The core's {@link SpriteEditCore.dimensionsVersion}. Consumers that cache
	 * bounds derived from `width`/`height` read this to know to re-read; the
	 * composite canvas object identity is stable across the change, so pixel
	 * caches keyed on it need no re-subscription.
	 */
	get dimensionsVersion(): number {
		return this.core.dimensionsVersion;
	}

	/** The core's dirty flag — the editor shell's editable-document contract. */
	get dirty(): boolean {
		return this.core.dirty;
	}

	get layers(): ReadonlyArray<LayerView> {
		return this.core.layers.map((layer) => ({
			id: layer.id,
			name: layer.name,
			canvas: this.thumbs.get(layer.id)!.canvas,
			blend: layer.blend,
			opacity: layer.opacity,
			visible: layer.visible,
		}));
	}

	/**
	 * The pixels of a cel bundled with the dimensions they are drawn against, as
	 * one value whose identity changes only when the document does. A thumbnail
	 * depends on this instead of listing a version counter it never reads.
	 */
	celThumb(layerId: string, frame: number): CelThumb | null {
		return this.cached(`cel:${layerId}:${frame}`, () => {
			const source = this.core.getCel(layerId, frame);
			return source
				? { source, width: this.width, height: this.height }
				: null;
		});
	}

	/** The composited pixels of a layer, bundled the way {@link celThumb} is. */
	layerThumb(layerId: string): LayerThumb | null {
		return this.cached(`layer:${layerId}`, () => {
			const canvas = this.thumbs.get(layerId)?.canvas;
			return canvas
				? { canvas, width: this.width, height: this.height }
				: null;
		});
	}

	setPixel(x: number, y: number, css: string): void {
		if (!this.inBounds(x, y)) {
			return;
		}
		if (this.strokeBuffer) {
			this.stampPaint(x, y, css);
			return;
		}
		this.beginStroke();
		this.stampPaint(x, y, css);
		this.commitStroke();
	}

	erasePixel(x: number, y: number): void {
		if (!this.inBounds(x, y)) {
			return;
		}
		if (this.strokeBuffer) {
			this.stampErase(x, y);
			return;
		}
		this.beginStroke();
		this.stampErase(x, y);
		this.commitStroke();
	}

	/**
	 * Repaint the live preview (active cel with the in-progress stroke buffer
	 * folded in) and notify subscribers, **once**. Stamping ({@link setPixel} /
	 * {@link erasePixel}) only mutates the buffer; the caller batches a single
	 * preview refresh per pointer event, so a fast drag that stamps dozens of
	 * cells composites the canvas once, not once per cell. Inert when no stroke
	 * is active.
	 */
	refreshStrokePreview(): void {
		if (!this.strokeBuffer) {
			return;
		}
		this.recompositePreview();
		this.notify();
	}

	/** Whether a stroke buffer is currently accumulating pixels. */
	get strokeActive(): boolean {
		return this.strokeBuffer !== null;
	}

	/**
	 * Begin a stroke into the **active cel** (active layer, active frame).
	 * Subsequent {@link setPixel}/{@link erasePixel} accumulate into a transient
	 * buffer composited over the cel for live preview but never mutating it until
	 * {@link commitStroke}. Discard with {@link cancelStroke}.
	 */
	beginStroke(): void {
		this.strokeBuffer = blankPixels(this.width, this.height);
		this.strokeMode = null;
		this.strokeOpacity = 1;
		this.strokeOpacityScale = 1;
		this.probedCss = null;
	}

	/**
	 * Scale the opacity the current stroke commits at (`0..1`), on top of the
	 * active colour's own alpha. Set once by a freehand tool after
	 * {@link beginStroke} to fold in pressure→opacity dynamics; reset to `1` on the
	 * next {@link beginStroke}. Applied a single time in {@link commitStroke}, so
	 * self-overlaps still do not compound.
	 */
	setStrokeOpacityScale(scale: number): void {
		this.strokeOpacityScale = scale < 0 ? 0 : scale > 1 ? 1 : scale;
	}

	/**
	 * Commit the active stroke into the active cel exactly once (paint = coverage
	 * at target opacity; erase = destination-out), then end the stroke. A no-op
	 * stroke leaves the cel untouched. The pixels land through
	 * {@link SpriteEditCore.writeStroke} — a fully-erased result drops the cel —
	 * and the caller records the undo entry from the pre-stroke snapshot (see
	 * `stroke.ts`).
	 */
	commitStroke(): void {
		const buffer = this.strokeBuffer;
		if (!buffer) {
			return;
		}
		const mode = this.strokeMode;
		this.strokeBuffer = null;
		this.strokeMode = null;
		if (!mode) {
			this.recomposite();
			this.notify();
			return;
		}
		this.core.writeStroke(
			buffer,
			mode,
			mode === "erase"
				? 1
				: this.strokeOpacity * this.strokeOpacityScale,
		);
	}

	/**
	 * Zero the in-progress stroke buffer without ending the stroke, so a shape
	 * tool can re-rasterise from scratch on every rubber-band move. Inert when no
	 * stroke is active; the caller follows with fresh stamps and one
	 * {@link refreshStrokePreview}.
	 */
	clearStroke(): void {
		if (!this.strokeBuffer) {
			return;
		}
		this.strokeBuffer.data.fill(0);
		this.strokeMode = null;
	}

	/** Discard the active stroke buffer without touching the cel. */
	cancelStroke(): void {
		if (!this.strokeBuffer) {
			return;
		}
		this.strokeBuffer = null;
		this.strokeMode = null;
		this.recomposite();
		this.notify();
	}

	private stampPaint(x: number, y: number, css: string): void {
		this.resolveStrokeColor(css);
		this.strokeMode = "paint";
		stampStrokePixel(
			this.strokeBuffer!,
			x,
			y,
			this.strokeColor.r,
			this.strokeColor.g,
			this.strokeColor.b,
		);
	}

	private stampErase(x: number, y: number): void {
		this.strokeMode = "erase";
		stampStrokePixel(this.strokeBuffer!, x, y, 0, 0, 0);
	}

	private resolveStrokeColor(css: string): void {
		if (css === this.probedCss) {
			return;
		}
		if (!this.probeCtx) {
			this.probeCtx = createCanvas(1, 1).ctx;
		}
		const ctx = this.probeCtx;
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = css;
		ctx.fillRect(0, 0, 1, 1);
		const d = ctx.getImageData(0, 0, 1, 1).data;
		this.strokeColor = { r: d[0]!, g: d[1]!, b: d[2]! };
		this.strokeOpacity = d[3]! / 255;
		this.probedCss = css;
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

	/**
	 * Composite one frame — every visible layer's cel through blend/opacity, via
	 * the same {@link compositeFrame} the save-time bake uses — into fresh
	 * straight-alpha pixels. Used by the onion-skin ghosts and the live preview
	 * panel; does **not** touch the document's composite canvas or the stroke
	 * buffer, so it is safe to call for any frame at any time.
	 */
	frameImage(frameIndex: number): PixelBuffer {
		return compositeFrame(
			this.width,
			this.height,
			this.core.frameLayers(frameIndex),
			canvasNativeBlend,
		);
	}

	/**
	 * Catch the canvas up with the core, then mirror the core's notification to
	 * this document's subscribers: a rotate resizes the composite element in place
	 * (identity preserved), and any edit that can have changed the composited
	 * image repaints it and the thumbnails.
	 */
	private onCoreChanged = (): void => {
		if (this.seenDimensionsVersion !== this.core.dimensionsVersion) {
			this.seenDimensionsVersion = this.core.dimensionsVersion;
			this.composite.width = this.core.width;
			this.composite.height = this.core.height;
			this.compositeCtx.imageSmoothingEnabled = false;
		}
		if (this.seenPixelVersion !== this.core.pixelVersion) {
			this.seenPixelVersion = this.core.pixelVersion;
			this.recomposite();
		}
		this.notify();
	};

	private frameStack(
		frame: number,
		withStroke: boolean,
	): LayerInput[] {
		const stack = this.core.frameLayers(frame);
		const buffer = this.strokeBuffer;
		const mode = this.strokeMode;
		if (
			!withStroke ||
			!buffer ||
			!mode ||
			frame !== this.core.activeFrameIndex
		) {
			return stack;
		}
		const index = this.core.layerIndex(this.core.activeLayerId);
		const layer = stack[index];
		if (!layer) {
			return stack;
		}
		stack[index] = {
			...layer,
			pixels: commitStrokeBuffer(
				layer.pixels,
				buffer,
				mode,
				mode === "erase"
					? 1
					: this.strokeOpacity * this.strokeOpacityScale,
			),
		};
		return stack;
	}

	private paintComposite(stack: LayerInput[]): void {
		const out = compositeFrame(
			this.width,
			this.height,
			stack,
			canvasNativeBlend,
		);
		this.putBuffer(this.compositeCtx, out);
	}

	/** Recomposite the active frame and refresh the per-layer thumbnails. */
	private recomposite(): void {
		this.paintComposite(
			this.frameStack(this.core.activeFrameIndex, false),
		);
		this.refreshThumbnails();
	}

	/** Recomposite the active frame with the live stroke buffer folded in. */
	private recompositePreview(): void {
		this.paintComposite(
			this.frameStack(this.core.activeFrameIndex, true),
		);
	}

	private refreshThumbnails(): void {
		const width = this.width;
		const height = this.height;
		const frame = this.core.activeFrameIndex;
		const live = new Set<string>();
		for (const layer of this.core.layers) {
			live.add(layer.id);
			let surface = this.thumbs.get(layer.id);
			if (!surface) {
				surface = createCanvas(width, height);
				this.thumbs.set(layer.id, surface);
			} else if (
				surface.canvas.width !== width ||
				surface.canvas.height !== height
			) {
				surface.canvas.width = width;
				surface.canvas.height = height;
				surface.ctx.imageSmoothingEnabled = false;
			}
			surface.ctx.clearRect(0, 0, width, height);
			const cel = this.core.getCel(layer.id, frame);
			if (cel) {
				this.putBuffer(surface.ctx, cel);
			}
		}
		const stale: string[] = [];
		for (const id of this.thumbs.keys()) {
			if (!live.has(id)) {
				stale.push(id);
			}
		}
		for (const id of stale) {
			this.thumbs.delete(id);
		}
	}

	private putBuffer(
		ctx: CanvasRenderingContext2D,
		buffer: PixelBuffer,
	): void {
		const image = ctx.createImageData(this.width, this.height);
		image.data.set(buffer.data);
		ctx.putImageData(image, 0, 0);
	}

	private inBounds(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}
}
