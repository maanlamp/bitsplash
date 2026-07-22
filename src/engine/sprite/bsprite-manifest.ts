import type { NineSliceInsets } from "../render/nine-slice";

/**
 * Blend-mode identifier stored on a layer. The engine never evaluates a blend
 * mode — it reads only baked frames — but the id round-trips layer intent for
 * the editor and importers. It is a superset of the canvas2d
 * {@link GlobalCompositeOperation} union with the five legacy pixel-math modes
 * needed for paint.NET/Aseprite parity.
 *
 * @see docs/bsprite-format.md — "Blend modes"
 */
export type BlendId =
	| GlobalCompositeOperation
	| "subtract"
	| "divide"
	| "reflect"
	| "glow"
	| "negation";

/**
 * A single layer, ordered bottom→top (index 0 painted first). `id` is the
 * stable key used in cel paths and {@link BspriteCel}; `name` is display-only
 * and never an identity key.
 */
export type BspriteLayer = Readonly<{
	id: string;
	name: string;
	opacity: number;
	visible: boolean;
	blend: BlendId;
}>;

/** One frame, in playback order. `duration` is display time in milliseconds. */
export type BspriteFrame = Readonly<{
	duration: number;
}>;

/**
 * A (layer, frame) pair that has authored pixels. Cels are sparse — any pair
 * not listed is fully transparent. The engine never reads cels (bakes only);
 * this type exists so the contract is complete and the editor writer can import
 * it.
 */
export type BspriteCel = Readonly<{
	layer: string;
	frame: number;
}>;

/**
 * A named, inclusive frame range `[from, to]` with a loop flag. Tags are the
 * engine's playback unit; `SpriteComponent.current` selects the active tag by
 * name.
 */
export type BspriteTag = Readonly<{
	name: string;
	from: number;
	to: number;
	loop: boolean;
}>;

/** An axis-aligned rectangle in canvas-pixel space. */
export type BspriteRect = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

/** A point in full-canvas pixel space (origin top-left, +x right, +y down). */
export type BspritePoint = Readonly<{
	x: number;
	y: number;
}>;

/** Tileset parameter block; its presence classifies the asset as a tileset. */
export type BspriteTileset = Readonly<{
	columns: number;
}>;

/**
 * Named per-frame attachment points: `attachments[name][frameKey]` where
 * `frameKey` is the zero-based frame index as a decimal string. Sparse per
 * frame — a frame with no entry for a point has no attachment there.
 */
export type BspriteAttachments = Readonly<
	Record<string, Readonly<Record<string, BspritePoint>>>
>;

/** Per-tag content rects, derived at bake from baked-frame alpha bounds. */
export type BspriteContentRects = Readonly<
	Record<string, BspriteRect>
>;

/**
 * The `manifest.json` object inside a `.bsprite` archive — the binding shared
 * contract between the editor (sole writer) and the engine (reader).
 *
 * @see docs/bsprite-format.md — the source of truth for this shape.
 */
export type BspriteManifest = Readonly<{
	version: number;
	width: number;
	height: number;
	layers: readonly BspriteLayer[];
	frames: readonly BspriteFrame[];
	cels: readonly BspriteCel[];
	tags: readonly BspriteTag[];
	contentRects?: BspriteContentRects;
	attachments?: BspriteAttachments;
	slice?: NineSliceInsets;
	tileset?: BspriteTileset;
}>;
