import type {
	BlendId,
	BspritePoint,
} from "../../engine/sprite/bsprite-manifest";
import { loadImage } from "../../engine/load";
import { Subscribable } from "../subscribable";
import { type LayerInput, compositeFrame } from "./bake-compositor";
import {
	type BspriteArchive,
	describeArchive,
	unpackBsprite,
} from "./bsprite-loader";
import type { DocumentSnapshot } from "./bsprite-writer";
import { canvasNativeBlend } from "./canvas-native-blend";
import {
	CelStore,
	type CelStoreDescription,
	type FrameSnapshot,
	type LayerSnapshot,
	type StrokeSnapshot,
} from "./cel-store";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import {
	type StrokeMode,
	commitStrokeBuffer,
	stampStrokePixel,
} from "./stroke-buffer";
import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";

export type {
	LayerSnapshot,
	FrameSnapshot,
	StrokeSnapshot,
} from "./cel-store";

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

/**
 * An opaque capture of the editor's selection state, restored on undo so that
 * undoing an edit also restores the marquee/floating selection that was active
 * when it ran.
 *
 * Selection is Phase 3 and does not exist yet; this is an opaque placeholder the
 * undo system already threads through so the interaction lands for free when the
 * selection suite is built. Phase 3 replaces it with the real mask type.
 */
export type SelectionSnapshot = Readonly<Record<string, unknown>>;

/**
 * The bridge the (Phase 3) selection system registers so the undo stack can
 * snapshot and restore selection state without the document knowing what a
 * selection is. Inert until {@link SpriteDocument.registerSelectionBridge} is
 * called with a real implementation.
 */
export type SelectionBridge = Readonly<{
	capture: () => SelectionSnapshot | null;
	restore: (snapshot: SelectionSnapshot | null) => void;
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
 * The sprite editor's document: a DOM shell around a canvas-free {@link CelStore}
 * (layers × frames of pixel cels, plus tags and the editing cursor). It owns the
 * **stable composite canvas** the renderer caches by, the per-layer thumbnail
 * canvases, the live stroke buffer/preview, and change notifications; the model
 * itself — every structural edit, its inverse, and whole-image transforms — lives
 * in the store.
 *
 * Invariants:
 * - `canvas` is the **same** {@link HTMLCanvasElement} for the document's whole
 *   life. Recompositing draws the active frame into it in place; a rotate resizes
 *   the same element rather than replacing it, so renderer caches keyed on the
 *   object stay valid.
 * - The composite shows the **active frame**: all visible layers' cels for
 *   `activeFrameIndex`, through blend/opacity, via the same compositor the bake
 *   uses (so preview and bake agree).
 */
export class SpriteDocument extends Subscribable {
	private store: CelStore;
	private composite: HTMLCanvasElement;
	private compositeCtx: CanvasRenderingContext2D;
	private thumbs = new Map<string, Surface>();
	private _dirty = false;
	private _dimensionsVersion = 0;
	private strokeBuffer: PixelBuffer | null = null;
	private strokeMode: StrokeMode | null = null;
	private strokeColor = { r: 0, g: 0, b: 0 };
	private strokeOpacity = 1;
	private strokeOpacityScale = 1;
	private probedCss: string | null = null;
	private probeCtx: CanvasRenderingContext2D | null = null;
	private floatingCommit: (() => void) | null = null;
	private selectionBridge: SelectionBridge | null = null;
	private baseArchive: BspriteArchive | null = null;
	private dirtyCels = new Set<string>();
	private dirtyBakes = new Set<number>();
	private structurallyDirty = false;

	constructor(width: number, height: number) {
		super();
		this.store = new CelStore(width, height);
		const { canvas, ctx } = createCanvas(width, height);
		this.composite = canvas;
		this.compositeCtx = ctx;
		this.recomposite();
	}

	/** Load a legacy PNG as a single layer, single frame (one cel). */
	static async load(url: string): Promise<SpriteDocument> {
		const image = await loadImage(url);
		const width = image.naturalWidth;
		const height = image.naturalHeight;
		const doc = new SpriteDocument(width, height);
		const { ctx } = createCanvas(width, height);
		ctx.drawImage(image, 0, 0);
		doc.store.putCel(
			doc.store.activeLayerId,
			0,
			ctx.getImageData(0, 0, width, height),
		);
		doc.recomposite();
		return doc;
	}

	/**
	 * Construct a multi-frame document from a manifest-like description — the path
	 * `.bsprite` load (step 15) and the `.aseprite` importer (step 18b) build a
	 * document with, bypassing the timeline. See {@link CelStore.fromDescription}.
	 */
	static fromDescription(desc: CelStoreDescription): SpriteDocument {
		const store = CelStore.fromDescription(desc);
		const doc = new SpriteDocument(store.width, store.height);
		doc.store = store;
		doc.recomposite();
		return doc;
	}

	/**
	 * Load a `.bsprite` archive into a multi-frame document: decode every cel PNG
	 * into the cel model ({@link describeArchive}) and retain the raw archive as
	 * the save baseline, so the next save copies unchanged cel/bake PNGs
	 * byte-verbatim (dirty-frame tracking). The engine's baked frames are ignored
	 * — the editor rebakes from cels on save.
	 */
	static fromBsprite(bytes: Uint8Array): SpriteDocument {
		const entries = unpackBsprite(bytes);
		const doc = SpriteDocument.fromDescription(
			describeArchive(entries),
		);
		doc.baseArchive = entries;
		return doc;
	}

	get canvas(): HTMLCanvasElement {
		return this.composite;
	}

	get width(): number {
		return this.store.width;
	}

	get height(): number {
		return this.store.height;
	}

	/**
	 * A monotonically increasing counter bumped whenever the canvas dimensions
	 * change (a rotate). Consumers that cache bounds derived from `width`/`height`
	 * read this to know to re-read; the composite canvas object identity is stable
	 * across the change, so pixel caches keyed on it need no re-subscription.
	 */
	get dimensionsVersion(): number {
		return this._dimensionsVersion;
	}

	get dirty(): boolean {
		return this._dirty;
	}

	get layers(): ReadonlyArray<LayerView> {
		return this.store.layers.map((layer) => ({
			id: layer.id,
			name: layer.name,
			canvas: this.thumbs.get(layer.id)!.canvas,
			blend: layer.blend,
			opacity: layer.opacity,
			visible: layer.visible,
		}));
	}

	get frames(): ReadonlyArray<Readonly<{ duration: number }>> {
		return this.store.frames;
	}

	get tags(): ReadonlyArray<BspriteTag> {
		return this.store.tags;
	}

	get activeLayerId(): string {
		return this.store.activeLayerId;
	}

	get activeFrameIndex(): number {
		return this.store.activeFrameIndex;
	}

	setActiveLayer(id: string): void {
		if (id === this.store.activeLayerId) {
			return;
		}
		this.commitPendingFloatingEdit();
		this.store.setActiveLayer(id);
		this.notify();
	}

	setActiveFrame(index: number): void {
		if (index === this.store.activeFrameIndex) {
			return;
		}
		this.commitPendingFloatingEdit();
		this.store.setActiveFrame(index);
		this.recomposite();
		this.notify();
	}

	layerIndex(id: string): number {
		return this.store.layerIndex(id);
	}

	blankLayerSnapshot(): LayerSnapshot {
		return this.store.blankLayerSnapshot();
	}

	snapshotLayer(id: string): LayerSnapshot | null {
		return this.store.snapshotLayer(id);
	}

	insertLayer(snapshot: LayerSnapshot, index: number): void {
		this.store.insertLayer(snapshot, index);
		this.recomposite();
		this.markBakesDirty();
		this.markDirty();
	}

	removeLayer(id: string): void {
		this.store.removeLayer(id);
		this.recomposite();
		this.markBakesDirty();
		this.markDirty();
	}

	setLayerOrder(ids: ReadonlyArray<string>): void {
		this.store.setLayerOrder(ids);
		this.recomposite();
		this.markBakesDirty();
		this.markDirty();
	}

	renameLayer(id: string, name: string): void {
		this.store.renameLayer(id, name);
		this.markDirty();
	}

	setBlend(id: string, blend: BlendId): void {
		this.store.setBlend(id, blend);
		this.recomposite();
		this.markBakesDirty();
		this.markDirty();
	}

	setOpacity(id: string, opacity: number): void {
		this.store.setOpacity(id, opacity);
		this.recomposite();
		this.markBakesDirty();
		this.markDirty();
	}

	setVisible(id: string, visible: boolean): void {
		this.store.setVisible(id, visible);
		this.recomposite();
		this.markBakesDirty();
		this.markDirty();
	}

	insertFrame(index: number, duration: number): void {
		this.store.insertFrame(index, duration);
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	removeFrame(index: number): FrameSnapshot {
		const snapshot = this.store.removeFrame(index);
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
		return snapshot;
	}

	peekFrame(index: number): FrameSnapshot {
		return this.store.peekFrame(index);
	}

	insertFrameSnapshot(index: number, snapshot: FrameSnapshot): void {
		this.store.insertFrameSnapshot(index, snapshot);
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	duplicateFrame(index: number): void {
		this.store.duplicateFrame(index);
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	moveFrame(from: number, to: number): void {
		this.store.moveFrame(from, to);
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	setFrameDuration(index: number, duration: number): void {
		this.store.setFrameDuration(index, duration);
		this.markDirty();
	}

	/** The pixels of a (layer, frame) cel, or `null` when the cel is absent. */
	getCel(layerId: string, frame: number): PixelBuffer | null {
		return this.store.getCel(layerId, frame);
	}

	/**
	 * The pixels of a cel bundled with the dimensions they are drawn against, as
	 * one value whose identity changes only when the document does. A thumbnail
	 * depends on this instead of listing a version counter it never reads.
	 */
	celThumb(layerId: string, frame: number): CelThumb | null {
		return this.cached(`cel:${layerId}:${frame}`, () => {
			const source = this.store.getCel(layerId, frame);
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

	/**
	 * Overwrite (or, with `null`, clear) a cel — the restore primitive the
	 * cel-move inverse uses. Recomposites, marks the cel and its bake dirty.
	 */
	setCel(
		layerId: string,
		frame: number,
		pixels: PixelBuffer | null,
	): void {
		this.store.setCel(layerId, frame, pixels);
		this.recomposite();
		this.markCelDirty(layerId, frame);
		this.markDirty();
	}

	/**
	 * Move (or, when `copy`, clone) the source cel's pixels into the destination
	 * cel. Recomposites and marks both cels (and their bakes) dirty. See
	 * {@link CelStore.moveCel}; the undoable command is `cel-commands.ts`.
	 */
	moveCel(
		srcLayerId: string,
		srcFrame: number,
		dstLayerId: string,
		dstFrame: number,
		copy: boolean,
	): void {
		this.store.moveCel(
			srcLayerId,
			srcFrame,
			dstLayerId,
			dstFrame,
			copy,
		);
		this.recomposite();
		this.markCelDirty(srcLayerId, srcFrame);
		this.markCelDirty(dstLayerId, dstFrame);
		this.markDirty();
	}

	appendTag(tag: BspriteTag): void {
		this.store.appendTag(tag);
		this.markDirty();
	}

	insertTag(index: number, tag: BspriteTag): void {
		this.store.insertTag(index, tag);
		this.markDirty();
	}

	removeTag(index: number): BspriteTag | null {
		const tag = this.store.removeTag(index);
		this.markDirty();
		return tag;
	}

	renameTag(index: number, name: string): void {
		this.store.renameTag(index, name);
		this.markDirty();
	}

	setTagRange(index: number, from: number, to: number): void {
		this.store.setTagRange(index, from, to);
		this.markDirty();
	}

	setTagLoop(index: number, loop: boolean): void {
		this.store.setTagLoop(index, loop);
		this.markDirty();
	}

	replaceTags(tags: readonly BspriteTag[]): void {
		this.store.replaceTags(tags);
		this.markDirty();
	}

	/** The attachment-point names present in the document, in insertion order. */
	attachmentNames(): readonly string[] {
		return this.store.attachmentNames();
	}

	/** The point for a name on a frame, or `undefined` when absent. */
	attachmentPoint(
		name: string,
		frame: number,
	): BspritePoint | undefined {
		return this.store.attachmentPoint(name, frame);
	}

	/** A clone of every per-frame point stored under a name (for delete undo). */
	attachmentFrames(
		name: string,
	): Readonly<Record<string, BspritePoint>> | undefined {
		return this.store.attachmentFrames(name);
	}

	/** Create an empty attachment name (metadata-only edit). */
	createAttachment(name: string): void {
		this.store.createAttachment(name);
		this.markDirty();
	}

	/** Delete an attachment name and all its per-frame points. */
	deleteAttachment(name: string): void {
		this.store.deleteAttachment(name);
		this.markDirty();
	}

	/** Restore a captured attachment name — the delete inverse. */
	restoreAttachment(
		name: string,
		frames: Readonly<Record<string, BspritePoint>>,
	): void {
		this.store.restoreAttachment(name, frames);
		this.markDirty();
	}

	/** Rename an attachment name, preserving its points. */
	renameAttachment(from: string, to: string): void {
		this.store.renameAttachment(from, to);
		this.markDirty();
	}

	/** Set (or move) the point for a name on a frame. */
	setAttachmentPoint(
		name: string,
		frame: number,
		point: BspritePoint,
	): void {
		this.store.setAttachmentPoint(name, frame, point);
		this.markDirty();
	}

	/** Clear the point for a name on a frame; the name is kept. */
	clearAttachmentPoint(name: string, frame: number): void {
		this.store.clearAttachmentPoint(name, frame);
		this.markDirty();
	}

	/**
	 * Mirror the whole image horizontally: flips every cel across all frames as
	 * one edit. Its own inverse; dimensions unchanged.
	 */
	flipHorizontal(): void {
		this.store.flipHorizontal();
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	/** Mirror the whole image vertically; its own inverse. */
	flipVertical(): void {
		this.store.flipVertical();
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	/**
	 * Rotate the whole image 90° clockwise: rotates every cel across all frames
	 * and swaps `width`↔`height`. The **same** composite element is resized in
	 * place (identity preserved) and `dimensionsVersion` bumped. Inverse is
	 * {@link rotateCcw}.
	 */
	rotateCw(): void {
		this.store.rotateCw();
		this.resizeToStore();
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	/** Rotate the whole image 90° counter-clockwise; inverse of {@link rotateCw}. */
	rotateCcw(): void {
		this.store.rotateCcw();
		this.resizeToStore();
		this.recomposite();
		this.markStructurallyDirty();
		this.markDirty();
	}

	private resizeToStore(): void {
		this.composite.width = this.store.width;
		this.composite.height = this.store.height;
		this.compositeCtx.imageSmoothingEnabled = false;
		this._dimensionsVersion += 1;
	}

	registerFloatingCommit(commit: (() => void) | null): void {
		this.floatingCommit = commit;
	}

	commitPendingFloatingEdit(): void {
		this.floatingCommit?.();
	}

	registerSelectionBridge(bridge: SelectionBridge | null): void {
		this.selectionBridge = bridge;
	}

	captureSelection(): SelectionSnapshot | null {
		return this.selectionBridge?.capture() ?? null;
	}

	restoreSelection(snapshot: SelectionSnapshot | null): void {
		this.selectionBridge?.restore(snapshot);
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
	 * at target opacity; erase = destination-out), then end the stroke. A
	 * fully-erased result drops the cel (kept sparse). A no-op stroke leaves the
	 * cel untouched. The caller records the undo entry from the pre-stroke
	 * snapshot (see `stroke.ts`).
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
		const base = this.activeCel();
		const opacity =
			mode === "erase"
				? 1
				: this.strokeOpacity * this.strokeOpacityScale;
		this.store.putCel(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
			commitStrokeBuffer(base, buffer, mode, opacity),
		);
		this.recomposite();
		this.markCelDirty(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
		);
		this.markDirty();
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

	/**
	 * The alpha (`0..255`) of the **active cel** (active layer, active frame) at
	 * `(x, y)`, or `0` when the cel or pixel is absent. Reads the cel directly, not
	 * the composite, so the alpha-lock ink tests the target layer's silhouette and
	 * stays constant across a live stroke (the stroke buffer is separate from the
	 * cel until commit).
	 */
	activeCelAlpha(x: number, y: number): number {
		if (!this.inBounds(x, y)) {
			return 0;
		}
		const cel = this.store.getCel(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
		);
		if (!cel) {
			return 0;
		}
		return cel.data[(y * this.width + x) * 4 + 3] ?? 0;
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

	/**
	 * The RGBA of the **active cel** (active layer, active frame) at `(x, y)`, or
	 * `null` when the cel or pixel is absent. Reads the cel directly (not the
	 * composite, not the live stroke buffer), so the shading ink shifts each pixel
	 * off its committed base colour and re-reading a cell mid-stroke never
	 * double-shifts — the mirror of {@link activeCelAlpha} for the alpha-lock ink.
	 */
	activeCelColorAt(
		x: number,
		y: number,
	): [number, number, number, number] | null {
		if (!this.inBounds(x, y)) {
			return null;
		}
		const cel = this.store.getCel(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
		);
		if (!cel) {
			return null;
		}
		const i = (y * this.width + x) * 4;
		return [
			cel.data[i]!,
			cel.data[i + 1]!,
			cel.data[i + 2]!,
			cel.data[i + 3]!,
		];
	}

	/** Capture the active cel (active layer, active frame) for stroke undo. */
	snapshot(): StrokeSnapshot {
		return this.store.snapshot();
	}

	/** Restore a cel captured by {@link snapshot}. */
	restore(snapshot: StrokeSnapshot): void {
		this.store.restore(snapshot);
		this.recomposite();
		this.markCelDirty(snapshot.layerId, snapshot.frameIndex);
		this.markDirty();
	}

	private activeCel(): PixelBuffer {
		return (
			this.store.getCel(
				this.store.activeLayerId,
				this.store.activeFrameIndex,
			) ?? blankPixels(this.width, this.height)
		);
	}

	markSaved(): void {
		this._dirty = false;
		this.notify();
	}

	/**
	 * The archive the document was loaded from (or last saved as), or `null` for a
	 * never-saved document. Passed to the writer as `previous` so unchanged
	 * cel/bake PNG entries are copied byte-verbatim rather than re-encoded.
	 */
	get previousArchive(): BspriteArchive | null {
		return this.baseArchive;
	}

	/**
	 * Whether a cel's PNG must be re-encoded on the next save. `false` means the
	 * writer may reuse the {@link previousArchive} entry byte-verbatim. A
	 * structural edit (frame add/remove/reorder, whole-image transform) marks
	 * every entry dirty conservatively, since it re-keys cel paths.
	 */
	isCelDirty(layerId: string, frameIndex: number): boolean {
		return (
			this.structurallyDirty ||
			this.dirtyCels.has(this.dirtyKey(layerId, frameIndex))
		);
	}

	/** Whether a frame's baked PNG must be re-encoded on the next save. */
	isBakeDirty(frameIndex: number): boolean {
		return this.structurallyDirty || this.dirtyBakes.has(frameIndex);
	}

	/**
	 * Adopt the just-written archive as the new save baseline and clear all
	 * dirty tracking, so the *next* save diffs against these bytes. Call after a
	 * successful write, before {@link markSaved}.
	 */
	adoptSavedArchive(bytes: Uint8Array): void {
		this.baseArchive = unpackBsprite(bytes);
		this.dirtyCels.clear();
		this.dirtyBakes.clear();
		this.structurallyDirty = false;
	}

	private dirtyKey(layerId: string, frameIndex: number): string {
		return `${layerId}#${frameIndex}`;
	}

	/** A pixel edit to one cel dirties that cel and its frame's bake. */
	private markCelDirty(layerId: string, frameIndex: number): void {
		this.dirtyCels.add(this.dirtyKey(layerId, frameIndex));
		this.dirtyBakes.add(frameIndex);
	}

	/** A layer visual-property/order edit changes every bake but no cel pixels. */
	private markBakesDirty(): void {
		for (let frame = 0; frame < this.store.frames.length; frame++) {
			this.dirtyBakes.add(frame);
		}
	}

	/**
	 * A structural edit re-keys cel paths (frame add/remove/reorder) or rewrites
	 * every cel (whole-image transform), so byte-verbatim reuse by path is no
	 * longer safe. Force a full re-encode on the next save — conservative but
	 * never corrupting.
	 */
	private markStructurallyDirty(): void {
		this.structurallyDirty = true;
	}

	/** Serialize the document for the `.bsprite` writer (all frames + metadata). */
	toSnapshot(): DocumentSnapshot {
		return this.store.toSnapshot();
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
			this.frameStack(frameIndex, false),
			canvasNativeBlend,
		);
	}

	private frameStack(
		frame: number,
		withStroke: boolean,
	): LayerInput[] {
		const activeId = this.store.activeLayerId;
		return this.store.layers.map((layer) => {
			let pixels =
				this.store.getCel(layer.id, frame) ??
				blankPixels(this.width, this.height);
			if (
				withStroke &&
				frame === this.store.activeFrameIndex &&
				this.strokeBuffer &&
				this.strokeMode &&
				layer.id === activeId
			) {
				pixels = commitStrokeBuffer(
					pixels,
					this.strokeBuffer,
					this.strokeMode,
					this.strokeMode === "erase"
						? 1
						: this.strokeOpacity * this.strokeOpacityScale,
				);
			}
			return {
				visible: layer.visible,
				opacity: layer.opacity,
				blend: layer.blend,
				pixels,
			};
		});
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
			this.frameStack(this.store.activeFrameIndex, false),
		);
		this.refreshThumbnails();
	}

	/** Recomposite the active frame with the live stroke buffer folded in. */
	private recompositePreview(): void {
		this.paintComposite(
			this.frameStack(this.store.activeFrameIndex, true),
		);
	}

	private refreshThumbnails(): void {
		const width = this.width;
		const height = this.height;
		const frame = this.store.activeFrameIndex;
		const live = new Set<string>();
		for (const layer of this.store.layers) {
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
			const cel = this.store.getCel(layer.id, frame);
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

	private markDirty(): void {
		this._dirty = true;
		this.notify();
	}
}
