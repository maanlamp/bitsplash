import type {
	BlendId,
	BspritePoint,
	BspriteTag,
} from "../../engine/sprite/bsprite-manifest";
import { Subscribable } from "../subscribable";
import type { LayerInput } from "./bake-compositor";
import {
	type BspriteArchive,
	describeArchive,
	unpackBsprite,
} from "./bsprite-loader";
import type { DocumentSnapshot } from "./bsprite-writer";
import {
	CelStore,
	type CelStoreDescription,
	type FrameSnapshot,
	type LayerMeta,
	type LayerSnapshot,
	type StrokeSnapshot,
} from "./cel-store";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import { type StrokeMode, commitStrokeBuffer } from "./stroke-buffer";

export type {
	FrameSnapshot,
	LayerSnapshot,
	StrokeSnapshot,
} from "./cel-store";

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
 * snapshot and restore selection state without the core knowing what a selection
 * is. Inert until {@link SpriteEditCore.registerSelectionBridge} is called with a
 * real implementation.
 */
export type SelectionBridge = Readonly<{
	capture: () => SelectionSnapshot | null;
	restore: (snapshot: SelectionSnapshot | null) => void;
}>;

const dirtyKey = (layerId: string, frameIndex: number): string =>
	`${layerId}#${frameIndex}`;

/**
 * The sprite editor's edit surface: every cel/layer/frame/tag/attachment edit,
 * the editing cursor, the save-baseline dirty tracking, and the undo
 * choke-point's floating-commit and selection hooks — over a single owned
 * {@link CelStore}.
 *
 * **Canvas-free by construction.** Nothing reachable from here touches the DOM,
 * so the whole edit surface — including every command routed through
 * {@link import("./command-router").runCommand} — can be driven headlessly, the
 * separation `SceneDocument` + command router + `Journal` already gives the scene
 * side. {@link import("./sprite-document").SpriteDocument} holds one of these and
 * adds the pixels-on-a-surface half: the stable composite canvas, the live stroke
 * preview, and the per-layer thumbnails.
 *
 * Every mutation notifies subscribers exactly once. Two monotonic counters tell a
 * subscriber *what* changed without it inspecting the model:
 * {@link pixelVersion} bumps when the composited image can have changed, and
 * {@link dimensionsVersion} bumps when a rotate swapped the dimensions.
 *
 * @example
 * ```ts
 * const core = SpriteEditCore.create(32, 32);
 * renameLayer(core, history, core.activeLayerId, "Base");
 * ```
 */
export class SpriteEditCore extends Subscribable {
	private readonly store: CelStore;
	private _dirty = false;
	private _pixelVersion = 0;
	private _dimensionsVersion = 0;
	private floatingCommit: (() => void) | null = null;
	private selectionBridge: SelectionBridge | null = null;
	private baseArchive: BspriteArchive | null = null;
	private dirtyCels = new Set<string>();
	private dirtyBakes = new Set<number>();
	private structurallyDirty = false;

	private constructor(store: CelStore) {
		super();
		this.store = store;
	}

	/** A fresh single-layer, single-frame core of the given size. */
	static create(width: number, height: number): SpriteEditCore {
		return new SpriteEditCore(new CelStore(width, height));
	}

	/**
	 * Build a multi-frame core from a manifest-like description — what the
	 * `.bsprite` load and the `.aseprite`/`.ora`/`.pdn` importers construct a
	 * document from, bypassing the timeline. See {@link CelStore.fromDescription}.
	 */
	static fromDescription(desc: CelStoreDescription): SpriteEditCore {
		return new SpriteEditCore(CelStore.fromDescription(desc));
	}

	/**
	 * A fresh core whose single layer's first cel holds `pixels` — the legacy PNG
	 * load path. The result is **not** dirty: this is construction, not an edit.
	 */
	static fromSingleCel(pixels: PixelBuffer): SpriteEditCore {
		const store = new CelStore(pixels.width, pixels.height);
		store.putCel(store.activeLayerId, 0, pixels);
		return new SpriteEditCore(store);
	}

	/**
	 * Decode a `.bsprite` archive into a core: every cel PNG becomes a cel
	 * ({@link describeArchive}) and the raw archive is retained as the save
	 * baseline, so the next save copies unchanged cel/bake PNGs byte-verbatim
	 * (dirty-frame tracking). The engine's baked frames are ignored — the editor
	 * rebakes from cels on save.
	 */
	static fromBsprite(bytes: Uint8Array): SpriteEditCore {
		const entries = unpackBsprite(bytes);
		const core = SpriteEditCore.fromDescription(
			describeArchive(entries),
		);
		core.baseArchive = entries;
		return core;
	}

	get width(): number {
		return this.store.width;
	}

	get height(): number {
		return this.store.height;
	}

	/**
	 * A monotonically increasing counter bumped whenever an edit can have changed
	 * the composited image. A subscriber that caches rendered pixels compares it
	 * across notifications to know whether to recomposite.
	 */
	get pixelVersion(): number {
		return this._pixelVersion;
	}

	/**
	 * A monotonically increasing counter bumped whenever {@link width}/
	 * {@link height} change (a rotate). Consumers that cache bounds derived from
	 * the dimensions read this to know to re-read.
	 */
	get dimensionsVersion(): number {
		return this._dimensionsVersion;
	}

	/** Whether there are edits since load or the last {@link markSaved}. */
	get dirty(): boolean {
		return this._dirty;
	}

	get layers(): ReadonlyArray<LayerMeta> {
		return this.store.layers;
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
		this.touchPixels();
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
		this.touchPixels();
		this.markBakesDirty();
		this.markDirty();
	}

	removeLayer(id: string): void {
		this.store.removeLayer(id);
		this.touchPixels();
		this.markBakesDirty();
		this.markDirty();
	}

	setLayerOrder(ids: ReadonlyArray<string>): void {
		this.store.setLayerOrder(ids);
		this.touchPixels();
		this.markBakesDirty();
		this.markDirty();
	}

	renameLayer(id: string, name: string): void {
		this.store.renameLayer(id, name);
		this.markDirty();
	}

	setBlend(id: string, blend: BlendId): void {
		this.store.setBlend(id, blend);
		this.touchPixels();
		this.markBakesDirty();
		this.markDirty();
	}

	setOpacity(id: string, opacity: number): void {
		this.store.setOpacity(id, opacity);
		this.touchPixels();
		this.markBakesDirty();
		this.markDirty();
	}

	setVisible(id: string, visible: boolean): void {
		this.store.setVisible(id, visible);
		this.touchPixels();
		this.markBakesDirty();
		this.markDirty();
	}

	insertFrame(index: number, duration: number): void {
		this.store.insertFrame(index, duration);
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
	}

	removeFrame(index: number): FrameSnapshot {
		const snapshot = this.store.removeFrame(index);
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
		return snapshot;
	}

	peekFrame(index: number): FrameSnapshot {
		return this.store.peekFrame(index);
	}

	insertFrameSnapshot(index: number, snapshot: FrameSnapshot): void {
		this.store.insertFrameSnapshot(index, snapshot);
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
	}

	duplicateFrame(index: number): void {
		this.store.duplicateFrame(index);
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
	}

	moveFrame(from: number, to: number): void {
		this.store.moveFrame(from, to);
		this.touchPixels();
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
	 * Overwrite (or, with `null`, clear) a cel — the restore primitive the
	 * cel-move inverse uses. Marks the cel and its bake dirty.
	 */
	setCel(
		layerId: string,
		frame: number,
		pixels: PixelBuffer | null,
	): void {
		this.store.setCel(layerId, frame, pixels);
		this.touchPixels();
		this.markCelDirty(layerId, frame);
		this.markDirty();
	}

	/**
	 * Move (or, when `copy`, clone) the source cel's pixels into the destination
	 * cel. Marks both cels (and their bakes) dirty. See {@link CelStore.moveCel};
	 * the undoable command is `cel-commands.ts`.
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
		this.touchPixels();
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
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
	}

	/** Mirror the whole image vertically; its own inverse. */
	flipVertical(): void {
		this.store.flipVertical();
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
	}

	/**
	 * Rotate the whole image 90° clockwise: rotates every cel across all frames
	 * and swaps `width`↔`height`, bumping {@link dimensionsVersion}. Inverse is
	 * {@link rotateCcw}.
	 */
	rotateCw(): void {
		this.store.rotateCw();
		this.touchDimensions();
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
	}

	/** Rotate the whole image 90° counter-clockwise; inverse of {@link rotateCw}. */
	rotateCcw(): void {
		this.store.rotateCcw();
		this.touchDimensions();
		this.touchPixels();
		this.markStructurallyDirty();
		this.markDirty();
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

	/**
	 * The alpha (`0..255`) of the **active cel** (active layer, active frame) at
	 * `(x, y)`, or `0` when the cel or pixel is absent. Reads the cel, not any
	 * composite, so the alpha-lock ink tests the target layer's silhouette and
	 * stays constant across a live stroke (a stroke is separate from the cel until
	 * it is committed).
	 */
	activeCelAlpha(x: number, y: number): number {
		if (!this.inBounds(x, y)) {
			return 0;
		}
		const cel = this.activeCelOrNull();
		if (!cel) {
			return 0;
		}
		return cel.data[(y * this.width + x) * 4 + 3] ?? 0;
	}

	/**
	 * The RGBA of the **active cel** (active layer, active frame) at `(x, y)`, or
	 * `null` when the cel or pixel is absent. Reads the committed cel, so the
	 * shading ink shifts each pixel off its committed base colour and re-reading a
	 * cell mid-stroke never double-shifts — the mirror of {@link activeCelAlpha}
	 * for the alpha-lock ink.
	 */
	activeCelColorAt(
		x: number,
		y: number,
	): [number, number, number, number] | null {
		if (!this.inBounds(x, y)) {
			return null;
		}
		const cel = this.activeCelOrNull();
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
		this.touchPixels();
		this.markCelDirty(snapshot.layerId, snapshot.frameIndex);
		this.markDirty();
	}

	/**
	 * Commit a finished stroke buffer into the **active cel** exactly once (paint =
	 * coverage at `opacity`; erase = destination-out). A fully-erased result drops
	 * the cel (kept sparse). The caller records the undo entry from its pre-stroke
	 * {@link snapshot} (see `stroke.ts`).
	 *
	 * Stroke *accumulation and preview* live on
	 * {@link import("./sprite-document").SpriteDocument}, which owns the preview
	 * surface and resolves CSS colours; this is the commit-only write.
	 */
	writeStroke(
		buffer: PixelBuffer,
		mode: StrokeMode,
		opacity: number,
	): void {
		this.store.putCel(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
			commitStrokeBuffer(this.activeCel(), buffer, mode, opacity),
		);
		this.touchPixels();
		this.markCelDirty(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
		);
		this.markDirty();
	}

	/**
	 * One frame's layers as compositor inputs, in the order of {@link layers} — an
	 * absent cel reads as transparent. Pure data: the caller supplies the blend
	 * backend.
	 */
	frameLayers(frame: number): LayerInput[] {
		return this.store.layers.map((layer) => ({
			visible: layer.visible,
			opacity: layer.opacity,
			blend: layer.blend,
			pixels:
				this.store.getCel(layer.id, frame) ??
				blankPixels(this.width, this.height),
		}));
	}

	/** The active cel's pixels, or fresh blank pixels when the cel is absent. */
	activeCel(): PixelBuffer {
		return (
			this.activeCelOrNull() ?? blankPixels(this.width, this.height)
		);
	}

	/** Clear the dirty flag after a successful save. */
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
			this.dirtyCels.has(dirtyKey(layerId, frameIndex))
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

	/** Serialize the document for the `.bsprite` writer (all frames + metadata). */
	toSnapshot(): DocumentSnapshot {
		return this.store.toSnapshot();
	}

	private activeCelOrNull(): PixelBuffer | null {
		return this.store.getCel(
			this.store.activeLayerId,
			this.store.activeFrameIndex,
		);
	}

	private inBounds(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}

	private touchPixels(): void {
		this._pixelVersion += 1;
	}

	private touchDimensions(): void {
		this._dimensionsVersion += 1;
	}

	/** A pixel edit to one cel dirties that cel and its frame's bake. */
	private markCelDirty(layerId: string, frameIndex: number): void {
		this.dirtyCels.add(dirtyKey(layerId, frameIndex));
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

	private markDirty(): void {
		this._dirty = true;
		this.notify();
	}
}
