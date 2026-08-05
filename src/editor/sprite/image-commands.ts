import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteEditCore } from "./sprite-edit-core";

/**
 * Whole-image transform commands, routed through {@link runCommand} so they
 * take one undo entry with a **real inverse**. Flips are their own inverse —
 * flipping the same axis twice restores the original — so `redo` and `undo`
 * run the identical document op. This is the same real-inverse pattern the
 * structural layer commands follow (see `layer-commands.ts`).
 */

/** Mirror the whole image horizontally as one undoable edit. */
export const flipImageHorizontal = (
	core: SpriteEditCore,
	history: History,
): void => {
	runCommand(core, history, {
		redo: () => core.flipHorizontal(),
		undo: () => core.flipHorizontal(),
	});
};

/** Mirror the whole image vertically as one undoable edit. */
export const flipImageVertical = (
	core: SpriteEditCore,
	history: History,
): void => {
	runCommand(core, history, {
		redo: () => core.flipVertical(),
		undo: () => core.flipVertical(),
	});
};

/**
 * Rotate the whole image 90° clockwise as one undoable edit — swaps
 * width↔height and rotates every cel across all frames. The inverse is a
 * counter-clockwise rotation (the exact opposite), not a repeat.
 */
export const rotateImageCw = (
	core: SpriteEditCore,
	history: History,
): void => {
	runCommand(core, history, {
		redo: () => core.rotateCw(),
		undo: () => core.rotateCcw(),
	});
};

/** Rotate the whole image 90° counter-clockwise as one undoable edit. */
export const rotateImageCcw = (
	core: SpriteEditCore,
	history: History,
): void => {
	runCommand(core, history, {
		redo: () => core.rotateCcw(),
		undo: () => core.rotateCw(),
	});
};
