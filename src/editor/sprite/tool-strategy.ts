import type { CursorValue } from "../../engine/cursor/cursor-authority";
import type { BspritePoint } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import type { FreeTransformParams } from "./free-transform";
import type { HandleId } from "./free-transform-handles";
import type { PixelBuffer } from "./pixel-buffer";
import type { PixelPerfectFilter } from "./pixel-perfect";
import type { SelectionController } from "./selection-controller";
import type { SelectionOp } from "./selection-mask";
import type { StrokeStabilizer } from "./stroke-stabilizer";
import type {
	SpriteDocument,
	StrokeSnapshot,
} from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import type { SpriteToolId } from "./sprite-tool-id";

/**
 * Everything a tool needs for one pointer event, assembled fresh by the hosting
 * panel per event. The panel owns the mapping from screen coordinates to the
 * cell `(x, y)` and supplies {@link paint}/{@link erase}, so a tool is written
 * once and works identically on the direct texture view and the tileset
 * paint-through view.
 *
 * `paint`/`erase` operate in cell space and already fold in the active ink and
 * symmetry; tools never write pixels directly, which is what keeps modifiers
 * orthogonal to the toolset.
 */
export type ToolContext = Readonly<{
	/** The document being edited. Reads (`alphaAt`, `colorAt`) go here. */
	doc: SpriteDocument;
	/** Live editor state: active color and modifiers. */
	state: SpriteEditorState;
	/** Undo/redo stack, for committing strokes on release. */
	history: History;
	/** The selection owner, for the marquee/lasso/wand/move tools. */
	selection: SelectionController;
	/** Whether Shift was held for the triggering event (selection: add). */
	shiftKey: boolean;
	/** Whether Alt was held for the triggering event (selection: subtract). */
	altKey: boolean;
	/** Integer cell under the pointer. */
	x: number;
	/** Integer cell under the pointer. */
	y: number;
	/** Whether `(x, y)` is inside the paintable image bounds. */
	overImage: boolean;
	/** `PointerEvent.button` for the triggering event (`-1` when none). */
	button: number;
	/**
	 * `PointerEvent.pointerId` for the triggering event (`-1` for a synthetic
	 * context with no originating pointer, e.g. a hover refresh or a gesture
	 * cancelled by a tool change). The gesture owner keys on this so a stray
	 * secondary pointer cannot end a stroke another pointer owns.
	 */
	pointerId: number;
	/**
	 * `PointerEvent.pressure` for the triggering event (0–1). Freehand tools map
	 * it to brush size and stroke opacity via {@link import("./brush-dynamics")};
	 * a reported `0` means "no pressure info" and is treated as full pressure.
	 */
	pressure: number;
	/** Route the pointer to the surface so a drag survives leaving the canvas. */
	capture: () => void;
	/**
	 * Paint the active color at cell `(x, y)` through the active ink and
	 * symmetry. Tools decide *which* cells (dab footprint, shape, region); the
	 * sink folds in ink and mirrors across the symmetry axis.
	 */
	paint: (x: number, y: number) => void;
	/** Erase cell `(x, y)` through the active ink and symmetry. */
	erase: (x: number, y: number) => void;
	/**
	 * The composite (what-you-see) RGBA under cell `(x, y)`, or `null` when out
	 * of bounds. Panel-supplied so the eyedropper samples correctly on both the
	 * direct texture view and the tileset paint-through view (which maps the cell
	 * back to its source pixel first).
	 */
	sample: (
		x: number,
		y: number,
	) => readonly [number, number, number, number] | null;
}>;

/**
 * Mutable scratch threaded across one pointer interaction (down → moves → up).
 * The panel creates it and passes the same object to every hook of a single
 * gesture; a tool stores its per-stroke state here rather than on the (shared,
 * singleton) strategy instance.
 */
export type ToolSession = {
	/** Pre-stroke pixel snapshot captured on down, committed on up. */
	snapshot: StrokeSnapshot | null;
	/** Last painted cell, for line interpolation between move samples. */
	last: { x: number; y: number } | null;
	/**
	 * Set by a tool in `onDown` when it opened a gesture that does **not** use the
	 * document stroke buffer (so `doc.strokeActive` is false), e.g. the attachment
	 * handle drag. The {@link import("./gesture-controller").GestureController}
	 * keeps the gesture live — dispatching `onMove`/`onUp`/`onCancel` to the owning
	 * tool — when either this flag or `doc.strokeActive` is set. Pixel tools leave
	 * it `false` and rely on the stroke buffer.
	 */
	active: boolean;
	/**
	 * The attachment tool's per-drag scratch: the point name being dragged and its
	 * value before the drag, so the release can record one undoable command and a
	 * cancel can restore the pre-drag state.
	 */
	attachment: {
		name: string;
		before: BspritePoint | undefined;
	} | null;
	/**
	 * The pixel-perfect stroke filter for this gesture, created by a freehand tool
	 * in `onDown` when the pixel-perfect modifier is on, else `null` (raw stroke).
	 */
	pp: PixelPerfectFilter | null;
	/**
	 * The stroke stabilizer for this gesture, created by a freehand tool in
	 * `onDown` when the stabilizer modifier is non-zero, else `null` (raw stroke).
	 * Smooths the incoming cell stream before pixel-perfect filtering.
	 */
	stab: StrokeStabilizer | null;
	/**
	 * A shape tool's rubber-band origin (the press cell). Set in `onDown`, read on
	 * every `onMove` to re-rasterise the shape from origin to the current cell,
	 * cleared on `onUp`/`onCancel`.
	 */
	shape: { x0: number; y0: number } | null;
	/**
	 * The selection tools' per-gesture scratch: which kind of drag is live
	 * (`rect`/`lasso` build a region, `move` drags a lifted float), its origin
	 * cell, the boolean op the region combines under, and the accumulating lasso
	 * path. Set in `onDown`, cleared on `onUp`/`onCancel`.
	 */
	selectionDrag: {
		mode: "rect" | "lasso" | "move";
		ax: number;
		ay: number;
		op: SelectionOp;
		points: Array<[number, number]>;
	} | null;
	/**
	 * The custom-brush tool's per-stroke scratch: the cel it stamps into, that
	 * cel's pre-stroke pixels (for the undo inverse and cancel restore), and the
	 * live accumulating result. Set in `onDown`, cleared on `onUp`/`onCancel`.
	 */
	custom: {
		layerId: string;
		frameIndex: number;
		before: PixelBuffer;
		working: PixelBuffer;
	} | null;
	/**
	 * The free-transform tool's per-drag scratch: the handle grabbed on `onDown`,
	 * the press cell, and the transform params + pivot at press. `onMove` derives
	 * the new params/pivot from the pointer's displacement relative to these, so a
	 * drag is stateless between moves. Set in `onDown`, cleared on `onUp`/`onCancel`.
	 */
	transformDrag: {
		handle: HandleId;
		startX: number;
		startY: number;
		startParams: FreeTransformParams;
		startPivot: { x: number; y: number };
	} | null;
};

/** What a tool wants drawn as its hover preview overlay this frame. */
export type ToolPreview = Readonly<{
	/** Show the brush cell highlight at the hovered cell. */
	brushCell: boolean;
}>;

/**
 * A sprite tool implemented as a strategy: lifecycle hooks plus a cursor and an
 * optional hover preview. Strategies are stateless singletons held in the tool
 * registry; per-gesture state lives on the {@link ToolSession}.
 *
 * Hooks are optional where a tool has nothing to do (e.g. `pan` has no
 * lifecycle and no preview — panning is driven by the engine input system).
 *
 * @example
 * ```ts
 * class EyedropperTool implements SpriteTool {
 *   readonly id = "eyedropper";
 *   onDown(ctx: ToolContext): void {
 *     const rgba = ctx.doc.colorAt(ctx.x, ctx.y);
 *     // ...set the active color from rgba
 *   }
 *   cursor(): CursorValue {
 *     return "crosshair";
 *   }
 * }
 * ```
 */
export interface SpriteTool {
	/** Registry id this strategy is bound to. */
	readonly id: SpriteToolId;
	/** Pointer pressed. Typically snapshots and applies the first cell. */
	onDown?(ctx: ToolContext, session: ToolSession): void;
	/** Pointer moved. Typically interpolates and applies while a stroke is live. */
	onMove?(ctx: ToolContext, session: ToolSession): void;
	/** Pointer released. Typically commits the stroke to history. */
	onUp?(ctx: ToolContext, session: ToolSession): void;
	/**
	 * Gesture aborted (pointer cancelled, or the editor tore down mid-stroke).
	 * Typically discards the in-progress stroke buffer without committing.
	 */
	onCancel?(ctx: ToolContext, session: ToolSession): void;
	/** The hover preview to draw, or `null`/absent for no preview. */
	preview?(ctx: ToolContext): ToolPreview | null;
	/** The cursor to show for this tool given whether the pointer is over image. */
	cursor(overImage: boolean): CursorValue;
	/**
	 * The tool's own configurable options (Phase-2 tool settings). Absent until a
	 * tool grows options; kept in the interface so the panel can render them
	 * generically rather than special-casing per tool.
	 */
	readonly options?: ReadonlyArray<unknown>;
}
