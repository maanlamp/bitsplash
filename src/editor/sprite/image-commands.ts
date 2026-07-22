import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteDocument } from "./sprite-document";

/**
 * Whole-image transform commands, routed through {@link runCommand} so they
 * take one undo entry with a **real inverse**. Flips are their own inverse —
 * flipping the same axis twice restores the original — so `redo` and `undo`
 * run the identical document op. This is the same real-inverse pattern the
 * structural layer commands follow (see `layer-commands.ts`).
 */

/** Mirror the whole image horizontally as one undoable edit. */
export const flipImageHorizontal = (
	doc: SpriteDocument,
	history: History,
): void => {
	runCommand(doc, history, {
		redo: () => doc.flipHorizontal(),
		undo: () => doc.flipHorizontal(),
	});
};

/** Mirror the whole image vertically as one undoable edit. */
export const flipImageVertical = (
	doc: SpriteDocument,
	history: History,
): void => {
	runCommand(doc, history, {
		redo: () => doc.flipVertical(),
		undo: () => doc.flipVertical(),
	});
};

/**
 * Rotate the whole image 90° clockwise as one undoable edit — swaps
 * width↔height and rotates every cel across all frames. The inverse is a
 * counter-clockwise rotation (the exact opposite), not a repeat.
 */
export const rotateImageCw = (
	doc: SpriteDocument,
	history: History,
): void => {
	runCommand(doc, history, {
		redo: () => doc.rotateCw(),
		undo: () => doc.rotateCcw(),
	});
};

/** Rotate the whole image 90° counter-clockwise as one undoable edit. */
export const rotateImageCcw = (
	doc: SpriteDocument,
	history: History,
): void => {
	runCommand(doc, history, {
		redo: () => doc.rotateCcw(),
		undo: () => doc.rotateCw(),
	});
};
