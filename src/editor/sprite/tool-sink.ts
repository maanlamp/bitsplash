import { eraseWithInk, paintWithInk } from "./inks";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import { mirrorCells } from "./symmetry";

/** A document pixel. */
export type CellPixel = { x: number; y: number };

/**
 * Maps a tool cell to the document pixel it writes/reads, or `null` when the
 * cell maps nowhere. The texture view uses {@link identityResolver}; the tileset
 * paint-through view maps a tile cell back to its source pixel.
 */
export type CellResolver = (x: number, y: number) => CellPixel | null;

/** The direct texture view: a cell *is* a document pixel. */
export const identityResolver: CellResolver = (x, y) => ({ x, y });

/**
 * The paint/erase/sample surface a {@link import("./tool-strategy").ToolContext}
 * is built from. It resolves the cell to a document pixel, then folds in the
 * active ink and mirrors across the symmetry axis — so every tool writes cells
 * while ink and symmetry stay orthogonal and shared by both editor panels.
 */
export type ToolSink = Readonly<{
	paint: (x: number, y: number) => void;
	erase: (x: number, y: number) => void;
	sample: (
		x: number,
		y: number,
	) => readonly [number, number, number, number] | null;
}>;

/**
 * Build a {@link ToolSink} over a document and editor state. `resolve` defaults
 * to the identity (texture view); pass a mapping resolver for the tileset view.
 * Symmetry mirrors in document-pixel space about the image centre.
 */
export const createToolSink = (
	doc: SpriteDocument,
	state: SpriteEditorState,
	resolve: CellResolver = identityResolver,
): ToolSink => ({
	paint: (x, y) => {
		const p = resolve(x, y);
		if (!p) {
			return;
		}
		for (const [mx, my] of mirrorCells(
			state.modifiers.symmetry,
			doc.width,
			doc.height,
			p.x,
			p.y,
		)) {
			paintWithInk(doc, state.modifiers.ink, mx, my, state.css);
		}
	},
	erase: (x, y) => {
		const p = resolve(x, y);
		if (!p) {
			return;
		}
		for (const [mx, my] of mirrorCells(
			state.modifiers.symmetry,
			doc.width,
			doc.height,
			p.x,
			p.y,
		)) {
			eraseWithInk(doc, state.modifiers.ink, mx, my);
		}
	},
	sample: (x, y) => {
		const p = resolve(x, y);
		return p ? doc.colorAt(p.x, p.y) : null;
	},
});
