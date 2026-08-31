import type {
	BspriteAttachments,
	BspriteFrame,
	BspriteLayer,
	BspritePoint,
	BspriteTag,
	BspriteTileset,
	BlendId,
} from "../../engine/sprite/bsprite-manifest";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import { DEFAULT_BLEND } from "./blend-modes";
import type { CelInput, DocumentSnapshot } from "./bsprite-writer";
import {
	flipHorizontal,
	flipVertical,
	rotateCcw,
	rotateCw,
} from "./image-transform";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/** Default per-frame display duration (ms) for a newly created frame. */
export const DEFAULT_FRAME_DURATION_MS = 100;

/** Layer metadata — the cel model no longer keeps a canvas per layer. */
export type LayerMeta = Readonly<{
	id: string;
	name: string;
	blend: BlendId;
	opacity: number;
	visible: boolean;
}>;

/**
 * One layer's pixels for a single frame, keyed by frame index. Absent frames are
 * transparent (sparse). Carried in a {@link LayerSnapshot} so a delete-layer
 * inverse can restore every cel the layer owned across all frames.
 */
export type CelPixels = Readonly<{
	frameIndex: number;
	pixels: PixelBuffer;
}>;

/**
 * A layer captured whole — its metadata plus every present cel across all
 * frames — enough to reconstruct it on undo. The **cel-scoped** pixel unit the
 * undo split is built on: the delete-layer inverse carries exactly this (the
 * deleted layer's cels), never the whole document.
 */
export type LayerSnapshot = Readonly<{
	id: string;
	name: string;
	blend: BlendId;
	opacity: number;
	visible: boolean;
	cels: readonly CelPixels[];
}>;

/**
 * A single frame captured whole — its duration plus every layer's cel for that
 * frame index. The delete-frame inverse carries this so undo restores the frame
 * and its pixels exactly.
 */
export type FrameSnapshot = Readonly<{
	duration: number;
	cels: readonly Readonly<{ layerId: string; pixels: PixelBuffer }>[];
}>;

/**
 * A stroke's pixels for one cel — the active layer's cel on the active frame —
 * captured before/after a stroke so the pixel edit can be undone/redone.
 * `frameIndex` pins the capture to the frame it was drawn on.
 */
export type StrokeSnapshot = Readonly<{
	layerId: string;
	frameIndex: number;
	data: PixelBuffer;
}>;

/**
 * The manifest-like description a multi-frame document is constructed from —
 * the input to {@link CelStore.fromDescription}. Step 15 (`.bsprite` load) and
 * step 18b (`.aseprite` import) decode their archives into this shape (cel PNGs
 * → {@link PixelBuffer}s) and hand it here; the timeline UI is not involved.
 */
export type CelStoreDescription = Readonly<{
	width: number;
	height: number;
	layers: readonly BspriteLayer[];
	frames: readonly BspriteFrame[];
	cels: readonly CelInput[];
	tags: readonly BspriteTag[];
	attachments?: BspriteAttachments;
	slice?: NineSliceInsets;
	tileset?: BspriteTileset;
}>;

const celKey = (layerId: string, frame: number): string =>
	`${layerId}#${frame}`;

const isTransparent = (buffer: PixelBuffer): boolean => {
	const { data } = buffer;
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 0) {
			return false;
		}
	}
	return true;
};

const clonePoints = (
	attachments: BspriteAttachments,
): Record<string, Record<string, BspritePoint>> => {
	const out: Record<string, Record<string, BspritePoint>> = {};
	for (const [name, byFrame] of Object.entries(attachments)) {
		out[name] = { ...byFrame };
	}
	return out;
};

/**
 * The sprite editor's document model: layers × frames of pixel **cels**, plus
 * frames' durations, tags, and the editing cursor (active layer + active frame).
 * This is the pure, canvas-free core — it holds only {@link PixelBuffer}s and
 * plain data, so the whole model (structural edits, their inverses, whole-image
 * transforms, multi-frame construction, and the serializer snapshot) is
 * headlessly testable. {@link import("./sprite-edit-core").SpriteEditCore} owns
 * one of these and adds the edit surface around it (dirty tracking, undo hooks,
 * change notifications); the DOM composite canvas and stroke preview live one
 * layer further out, on {@link import("./sprite-document").SpriteDocument}.
 *
 * Cels are **sparse**: a (layer, frame) pair with no authored pixels has no
 * entry and is treated as fully transparent. Stored buffers are never mutated
 * in place — every edit replaces a cel with a fresh buffer — so history entries
 * that reference a captured buffer stay valid without defensive copies.
 */
export class CelStore {
	private _width: number;
	private _height: number;
	#layers: LayerMeta[] = [];
	#frames: { duration: number }[] = [];
	private cels = new Map<string, PixelBuffer>();
	#tags: BspriteTag[] = [];
	private attachments: Record<string, Record<string, BspritePoint>> =
		{};
	private slice: NineSliceInsets | undefined;
	private tileset: BspriteTileset | undefined;
	#activeLayerId: string;
	#activeFrameIndex = 0;

	constructor(width: number, height: number) {
		this._width = width;
		this._height = height;
		const base: LayerMeta = {
			id: crypto.randomUUID(),
			name: "Layer 1",
			blend: DEFAULT_BLEND,
			opacity: 1,
			visible: true,
		};
		this.#layers = [base];
		this.#frames = [{ duration: DEFAULT_FRAME_DURATION_MS }];
		this.#activeLayerId = base.id;
	}

	/**
	 * Build a multi-frame store from a manifest-like {@link CelStoreDescription}.
	 * The construction path for loading a `.bsprite` (step 15) and importing an
	 * `.aseprite` (step 18b): both decode their cel images into
	 * {@link PixelBuffer}s and pass them here. Requires at least one layer and
	 * one frame.
	 */
	static fromDescription(desc: CelStoreDescription): CelStore {
		if (desc.layers.length === 0) {
			throw new Error("A document needs at least one layer.");
		}
		if (desc.frames.length === 0) {
			throw new Error("A document needs at least one frame.");
		}
		const store = new CelStore(desc.width, desc.height);
		store.#layers = desc.layers.map((layer) => ({
			id: layer.id,
			name: layer.name,
			blend: layer.blend,
			opacity: layer.opacity,
			visible: layer.visible,
		}));
		store.#frames = desc.frames.map((frame) => ({
			duration: frame.duration,
		}));
		store.cels = new Map();
		for (const cel of desc.cels) {
			store.cels.set(celKey(cel.layerId, cel.frameIndex), cel.pixels);
		}
		store.#tags = desc.tags.map((tag) => ({ ...tag }));
		store.attachments = desc.attachments
			? clonePoints(desc.attachments)
			: {};
		store.slice = desc.slice;
		store.tileset = desc.tileset;
		store.#activeLayerId = store.#layers[0]!.id;
		store.#activeFrameIndex = 0;
		return store;
	}

	get width(): number {
		return this._width;
	}

	get height(): number {
		return this._height;
	}

	get layers(): ReadonlyArray<LayerMeta> {
		return this.#layers;
	}

	get frames(): ReadonlyArray<Readonly<{ duration: number }>> {
		return this.#frames;
	}

	get tags(): ReadonlyArray<BspriteTag> {
		return this.#tags;
	}

	get activeLayerId(): string {
		return this.#activeLayerId;
	}

	get activeFrameIndex(): number {
		return this.#activeFrameIndex;
	}

	/** The pixels of a (layer, frame) cel, or `null` when the cel is absent. */
	getCel(layerId: string, frame: number): PixelBuffer | null {
		return this.cels.get(celKey(layerId, frame)) ?? null;
	}

	/**
	 * Store a cel's pixels, or **delete** the cel when the buffer is fully
	 * transparent — keeping cels sparse by construction. Takes ownership of
	 * `pixels`; the buffer must not be mutated afterwards.
	 */
	putCel(layerId: string, frame: number, pixels: PixelBuffer): void {
		const key = celKey(layerId, frame);
		if (isTransparent(pixels)) {
			this.cels.delete(key);
		} else {
			this.cels.set(key, pixels);
		}
	}

	/**
	 * Overwrite a cel with `pixels`, or **clear** it when `pixels` is `null` (or
	 * fully transparent) — the restore primitive the cel-move inverse uses to put
	 * both endpoints back exactly, including the absent (transparent) state that
	 * {@link putCel} can only reach with a transparent buffer. Takes ownership of
	 * `pixels`; the buffer must not be mutated afterwards.
	 */
	setCel(
		layerId: string,
		frame: number,
		pixels: PixelBuffer | null,
	): void {
		const key = celKey(layerId, frame);
		if (pixels === null || isTransparent(pixels)) {
			this.cels.delete(key);
		} else {
			this.cels.set(key, pixels);
		}
	}

	/**
	 * Move (or, when `copy`, clone) the source cel's pixels into the destination
	 * cel, overwriting whatever was there. A move clears the source; a copy leaves
	 * it. A no-op (same cel, or an absent source) does nothing. The destination
	 * always receives a fresh buffer so source and destination never alias.
	 */
	moveCel(
		srcLayerId: string,
		srcFrame: number,
		dstLayerId: string,
		dstFrame: number,
		copy: boolean,
	): void {
		if (srcLayerId === dstLayerId && srcFrame === dstFrame) {
			return;
		}
		const src = this.getCel(srcLayerId, srcFrame);
		if (!src) {
			return;
		}
		this.setCel(dstLayerId, dstFrame, {
			width: src.width,
			height: src.height,
			data: new Uint8ClampedArray(src.data),
		});
		if (!copy) {
			this.setCel(srcLayerId, srcFrame, null);
		}
	}

	/** Capture the active cel (active layer, active frame) for stroke undo. */
	snapshot(): StrokeSnapshot {
		return {
			layerId: this.#activeLayerId,
			frameIndex: this.#activeFrameIndex,
			data:
				this.getCel(this.#activeLayerId, this.#activeFrameIndex) ??
				blankPixels(this._width, this._height),
		};
	}

	/** Restore a cel captured by {@link snapshot}. */
	restore(snapshot: StrokeSnapshot): void {
		this.putCel(snapshot.layerId, snapshot.frameIndex, snapshot.data);
	}

	setActiveLayer(id: string): void {
		if (this.#layers.some((l) => l.id === id)) {
			this.#activeLayerId = id;
		}
	}

	setActiveFrame(index: number): void {
		if (index >= 0 && index < this.#frames.length) {
			this.#activeFrameIndex = index;
		}
	}

	layerIndex(id: string): number {
		return this.#layers.findIndex((l) => l.id === id);
	}

	/** Metadata for a fresh, empty layer (no cels), without adding it. */
	blankLayerSnapshot(): LayerSnapshot {
		return {
			id: crypto.randomUUID(),
			name: `Layer ${this.#layers.length + 1}`,
			blend: DEFAULT_BLEND,
			opacity: 1,
			visible: true,
			cels: [],
		};
	}

	/** Capture a layer whole — metadata plus every present cel across frames. */
	snapshotLayer(id: string): LayerSnapshot | null {
		const layer = this.#layers.find((l) => l.id === id);
		if (!layer) {
			return null;
		}
		const cels: CelPixels[] = [];
		for (let frame = 0; frame < this.#frames.length; frame++) {
			const pixels = this.getCel(id, frame);
			if (pixels) {
				cels.push({ frameIndex: frame, pixels });
			}
		}
		return { ...layer, cels };
	}

	insertLayer(snapshot: LayerSnapshot, index: number): void {
		const meta: LayerMeta = {
			id: snapshot.id,
			name: snapshot.name,
			blend: snapshot.blend,
			opacity: snapshot.opacity,
			visible: snapshot.visible,
		};
		const at = Math.max(0, Math.min(index, this.#layers.length));
		this.#layers.splice(at, 0, meta);
		for (const cel of snapshot.cels) {
			this.cels.set(celKey(snapshot.id, cel.frameIndex), cel.pixels);
		}
	}

	removeLayer(id: string): void {
		const index = this.#layers.findIndex((l) => l.id === id);
		if (index < 0) {
			return;
		}
		this.#layers.splice(index, 1);
		for (let frame = 0; frame < this.#frames.length; frame++) {
			this.cels.delete(celKey(id, frame));
		}
		if (this.#activeLayerId === id && this.#layers.length > 0) {
			const next =
				this.#layers[Math.min(index, this.#layers.length - 1)]!;
			this.#activeLayerId = next.id;
		}
	}

	setLayerOrder(ids: ReadonlyArray<string>): void {
		if (ids.length !== this.#layers.length) {
			return;
		}
		const next = ids.map((id) =>
			this.#layers.find((l) => l.id === id),
		);
		if (next.some((l) => !l)) {
			return;
		}
		this.#layers = next as LayerMeta[];
	}

	renameLayer(id: string, name: string): void {
		this.updateLayer(id, (layer) => ({ ...layer, name }));
	}

	setBlend(id: string, blend: BlendId): void {
		this.updateLayer(id, (layer) => ({ ...layer, blend }));
	}

	setOpacity(id: string, opacity: number): void {
		this.updateLayer(id, (layer) => ({ ...layer, opacity }));
	}

	setVisible(id: string, visible: boolean): void {
		this.updateLayer(id, (layer) => ({ ...layer, visible }));
	}

	private updateLayer(
		id: string,
		update: (layer: LayerMeta) => LayerMeta,
	): void {
		const index = this.#layers.findIndex((l) => l.id === id);
		if (index < 0) {
			return;
		}
		this.#layers[index] = update(this.#layers[index]!);
	}

	/**
	 * Insert a blank frame at `index`, shifting later frames up and re-keying
	 * their cels. Tag boundaries at or after `index` shift up so ranges stay
	 * valid. Inverse of {@link removeFrame} for a frame this method inserted.
	 */
	insertFrame(index: number, duration: number): void {
		this.insertFrameSnapshot(index, { duration, cels: [] });
	}

	/**
	 * Remove the frame at `index`, dropping its cels and shifting later frames
	 * (and their cels) down. Tag boundaries are shifted/clamped to stay valid.
	 * Returns the removed frame captured whole so a command can restore it.
	 */
	removeFrame(index: number): FrameSnapshot {
		const snapshot = this.peekFrame(index);
		for (const layer of this.#layers) {
			this.cels.delete(celKey(layer.id, index));
		}
		this.#frames.splice(index, 1);
		this.remapCels((frame) => (frame > index ? frame - 1 : frame));
		const last = this.#frames.length - 1;
		this.#tags = this.#tags.map((tag) => {
			const from = tag.from > index ? tag.from - 1 : tag.from;
			const to = tag.to > index ? tag.to - 1 : tag.to;
			return {
				...tag,
				from: Math.min(from, Math.max(0, last)),
				to: Math.min(to, Math.max(0, last)),
			};
		});
		if (this.#activeFrameIndex > last) {
			this.#activeFrameIndex = Math.max(0, last);
		}
		return snapshot;
	}

	/** Capture a frame whole (duration + every layer's cel) without mutating. */
	peekFrame(index: number): FrameSnapshot {
		const cels: Array<{ layerId: string; pixels: PixelBuffer }> = [];
		for (const layer of this.#layers) {
			const pixels = this.getCel(layer.id, index);
			if (pixels) {
				cels.push({ layerId: layer.id, pixels });
			}
		}
		return {
			duration:
				this.#frames[index]?.duration ?? DEFAULT_FRAME_DURATION_MS,
			cels,
		};
	}

	/**
	 * Insert a captured frame at `index`, shifting later frames (and their cels)
	 * up and shifting tag boundaries at or after `index`. Restores the frame's
	 * per-layer cels. Backs both {@link insertFrame} (empty snapshot) and the
	 * delete-frame inverse.
	 */
	insertFrameSnapshot(index: number, snapshot: FrameSnapshot): void {
		const at = Math.max(0, Math.min(index, this.#frames.length));
		this.remapCels((frame) => (frame >= at ? frame + 1 : frame));
		this.#frames.splice(at, 0, { duration: snapshot.duration });
		for (const cel of snapshot.cels) {
			this.cels.set(celKey(cel.layerId, at), cel.pixels);
		}
		this.#tags = this.#tags.map((tag) => ({
			...tag,
			from: tag.from >= at ? tag.from + 1 : tag.from,
			to: tag.to >= at ? tag.to + 1 : tag.to,
		}));
		if (this.#activeFrameIndex >= at) {
			this.#activeFrameIndex += 1;
		}
	}

	/**
	 * Duplicate the frame at `index`, inserting the copy immediately after it.
	 * The inverse is {@link removeFrame} at `index + 1`.
	 */
	duplicateFrame(index: number): void {
		const snapshot = this.peekFrame(index);
		this.insertFrameSnapshot(index + 1, snapshot);
	}

	/**
	 * Move the frame at `from` to `to` (a splice move), carrying its duration and
	 * cels. Tags are **not** re-associated — they stay pinned to their index
	 * positions (a positional model the timeline UI in step 16 can refine). The
	 * inverse is `moveFrame(to, from)`.
	 */
	moveFrame(from: number, to: number): void {
		if (
			from < 0 ||
			from >= this.#frames.length ||
			to < 0 ||
			to >= this.#frames.length ||
			from === to
		) {
			return;
		}
		const order = this.#frames.map((_f, i) => i);
		const [moved] = order.splice(from, 1);
		order.splice(to, 0, moved!);
		this.reorderFrames(order);
	}

	private reorderFrames(order: readonly number[]): void {
		const frames = order.map((i) => this.#frames[i]!);
		const next = new Map<string, PixelBuffer>();
		for (let newFrame = 0; newFrame < order.length; newFrame++) {
			const oldFrame = order[newFrame]!;
			for (const layer of this.#layers) {
				const pixels = this.cels.get(celKey(layer.id, oldFrame));
				if (pixels) {
					next.set(celKey(layer.id, newFrame), pixels);
				}
			}
		}
		this.#frames = frames;
		this.cels = next;
	}

	setFrameDuration(index: number, duration: number): void {
		const frame = this.#frames[index];
		if (frame && duration > 0) {
			this.#frames[index] = { duration };
		}
	}

	private remapCels(map: (frame: number) => number): void {
		const next = new Map<string, PixelBuffer>();
		for (const [key, pixels] of this.cels) {
			const hash = key.lastIndexOf("#");
			const layerId = key.slice(0, hash);
			const frame = Number(key.slice(hash + 1));
			next.set(celKey(layerId, map(frame)), pixels);
		}
		this.cels = next;
	}

	appendTag(tag: BspriteTag): void {
		this.#tags.push({ ...tag });
	}

	insertTag(index: number, tag: BspriteTag): void {
		const at = Math.max(0, Math.min(index, this.#tags.length));
		this.#tags.splice(at, 0, { ...tag });
	}

	removeTag(index: number): BspriteTag | null {
		if (index < 0 || index >= this.#tags.length) {
			return null;
		}
		return this.#tags.splice(index, 1)[0] ?? null;
	}

	renameTag(index: number, name: string): void {
		this.updateTag(index, (tag) => ({ ...tag, name }));
	}

	setTagRange(index: number, from: number, to: number): void {
		if (from < 0 || to >= this.#frames.length || from > to) {
			return;
		}
		this.updateTag(index, (tag) => ({ ...tag, from, to }));
	}

	setTagLoop(index: number, loop: boolean): void {
		this.updateTag(index, (tag) => ({ ...tag, loop }));
	}

	/** Replace the whole tag list (a delete-frame inverse restores tags whole). */
	replaceTags(tags: readonly BspriteTag[]): void {
		this.#tags = tags.map((tag) => ({ ...tag }));
	}

	private updateTag(
		index: number,
		update: (tag: BspriteTag) => BspriteTag,
	): void {
		const tag = this.#tags[index];
		if (tag) {
			this.#tags[index] = update(tag);
		}
	}

	/** The attachment-point names present in the document, in insertion order. */
	attachmentNames(): readonly string[] {
		return Object.keys(this.attachments);
	}

	/** Whether an attachment name exists (even with no per-frame points). */
	hasAttachment(name: string): boolean {
		return name in this.attachments;
	}

	/** The point for a name on a frame, or `undefined` when absent. */
	attachmentPoint(
		name: string,
		frame: number,
	): BspritePoint | undefined {
		return this.attachments[name]?.[String(frame)];
	}

	/**
	 * A clone of every per-frame point stored under a name, or `undefined` when
	 * the name does not exist. Used by the delete-name command to capture the
	 * whole name for its inverse.
	 */
	attachmentFrames(
		name: string,
	): Readonly<Record<string, BspritePoint>> | undefined {
		const byFrame = this.attachments[name];
		return byFrame ? { ...byFrame } : undefined;
	}

	/** Create an empty attachment name (no per-frame points). Idempotent. */
	createAttachment(name: string): void {
		if (!(name in this.attachments)) {
			this.attachments[name] = {};
		}
	}

	/** Delete an attachment name and every per-frame point stored under it. */
	deleteAttachment(name: string): void {
		delete this.attachments[name];
	}

	/**
	 * Restore an attachment name with a captured set of per-frame points — the
	 * inverse of {@link deleteAttachment}. Clones the frames so later edits do not
	 * alias the captured snapshot.
	 */
	restoreAttachment(
		name: string,
		frames: Readonly<Record<string, BspritePoint>>,
	): void {
		this.attachments[name] = { ...frames };
	}

	/**
	 * Rename an attachment name, preserving its per-frame points. A no-op when the
	 * source is absent or the target name already exists.
	 */
	renameAttachment(from: string, to: string): void {
		if (
			from === to ||
			!(from in this.attachments) ||
			to in this.attachments
		) {
			return;
		}
		this.attachments[to] = this.attachments[from]!;
		delete this.attachments[from];
	}

	/** Set (or move) the point for a name on a frame, creating the name if absent. */
	setAttachmentPoint(
		name: string,
		frame: number,
		point: BspritePoint,
	): void {
		const byFrame = (this.attachments[name] ??= {});
		byFrame[String(frame)] = { x: point.x, y: point.y };
	}

	/** Clear the point for a name on a frame; the name itself is kept. */
	clearAttachmentPoint(name: string, frame: number): void {
		const byFrame = this.attachments[name];
		if (byFrame) {
			delete byFrame[String(frame)];
		}
	}

	/**
	 * Mirror the whole image left-to-right: every cel (all layers, all frames) is
	 * flipped, and attachment x-coordinates are mirrored. Dimensions unchanged;
	 * its own inverse.
	 */
	flipHorizontal(): void {
		this.transformCels(flipHorizontal, this._width, this._height);
		this.attachments = this.mapPoints((p) => ({
			x: this._width - p.x,
			y: p.y,
		}));
	}

	/** Mirror the whole image top-to-bottom; its own inverse. */
	flipVertical(): void {
		this.transformCels(flipVertical, this._width, this._height);
		this.attachments = this.mapPoints((p) => ({
			x: p.x,
			y: this._height - p.y,
		}));
	}

	/**
	 * Rotate the whole image 90° clockwise: swaps width↔height, rotates every cel
	 * (all layers, all frames), and rotates attachment points. Inverse is
	 * {@link rotateCcw}.
	 */
	rotateCw(): void {
		const oldHeight = this._height;
		this.transformCels(rotateCw, oldHeight, this._width);
		this.attachments = this.mapPoints((p) => ({
			x: oldHeight - p.y,
			y: p.x,
		}));
	}

	/** Rotate the whole image 90° counter-clockwise; inverse of {@link rotateCw}. */
	rotateCcw(): void {
		const oldWidth = this._width;
		this.transformCels(rotateCcw, this._height, oldWidth);
		this.attachments = this.mapPoints((p) => ({
			x: p.y,
			y: oldWidth - p.x,
		}));
	}

	private transformCels(
		transform: (buffer: PixelBuffer) => PixelBuffer,
		newWidth: number,
		newHeight: number,
	): void {
		const next = new Map<string, PixelBuffer>();
		for (const [key, pixels] of this.cels) {
			next.set(key, transform(pixels));
		}
		this.cels = next;
		this._width = newWidth;
		this._height = newHeight;
	}

	private mapPoints(
		map: (point: BspritePoint) => BspritePoint,
	): Record<string, Record<string, BspritePoint>> {
		const out: Record<string, Record<string, BspritePoint>> = {};
		for (const [name, byFrame] of Object.entries(this.attachments)) {
			const mapped: Record<string, BspritePoint> = {};
			for (const [frame, point] of Object.entries(byFrame)) {
				mapped[frame] = map(point);
			}
			out[name] = mapped;
		}
		return out;
	}

	/**
	 * Serialize the model into a {@link DocumentSnapshot} for the `.bsprite`
	 * writer: all layers, frames, present cels (sparse), tags, and any
	 * attachments/slice/tileset. Pure — no DOM — so a constructed store can be
	 * serialized headlessly.
	 */
	toSnapshot(): DocumentSnapshot {
		const cels: CelInput[] = [];
		for (let frame = 0; frame < this.#frames.length; frame++) {
			for (const layer of this.#layers) {
				const pixels = this.getCel(layer.id, frame);
				if (pixels) {
					cels.push({ layerId: layer.id, frameIndex: frame, pixels });
				}
			}
		}
		const attachmentNames = Object.keys(this.attachments);
		return {
			width: this._width,
			height: this._height,
			layers: this.#layers.map((layer) => ({ ...layer })),
			frames: this.#frames.map((frame) => ({
				duration: frame.duration,
			})),
			cels,
			tags: this.#tags.map((tag) => ({ ...tag })),
			...(attachmentNames.length > 0
				? { attachments: clonePoints(this.attachments) }
				: {}),
			...(this.slice ? { slice: this.slice } : {}),
			...(this.tileset ? { tileset: this.tileset } : {}),
		};
	}
}
