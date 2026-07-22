import type { History } from "../history";
import { runCommand } from "./command-router";
import {
	flipImageHorizontal,
	flipImageVertical,
	rotateImageCcw,
	rotateImageCw,
} from "./image-commands";
import type { PixelBuffer } from "./pixel-buffer";
import type { SelectionController } from "./selection-controller";
import type { SpriteDocument } from "./sprite-document";
import { wrapShift } from "./wrap-shift";

/**
 * Selection-aware transform commands: when a selection (or float) is active they
 * transform it in place through the {@link SelectionController} (folded into the
 * float's single commit undo entry); otherwise they fall back to the whole-image
 * transform, which is its own {@link runCommand} undo entry. This mirrors the
 * conventional pixel-editor behaviour where flip/rotate act on the selection if
 * one exists and on the whole canvas if not. A `null` controller (document still
 * loading) always takes the whole-image path.
 */

/** Flip the active selection horizontally, else the whole image. */
export const flipHorizontal = (
	doc: SpriteDocument,
	history: History,
	selection: SelectionController | null,
): void => {
	if (selection?.flipHorizontal()) {
		return;
	}
	flipImageHorizontal(doc, history);
};

/** Flip the active selection vertically, else the whole image. */
export const flipVertical = (
	doc: SpriteDocument,
	history: History,
	selection: SelectionController | null,
): void => {
	if (selection?.flipVertical()) {
		return;
	}
	flipImageVertical(doc, history);
};

/** Rotate the active selection 90° clockwise, else the whole image. */
export const rotateCw = (
	doc: SpriteDocument,
	history: History,
	selection: SelectionController | null,
): void => {
	if (selection?.rotateCw()) {
		return;
	}
	rotateImageCw(doc, history);
};

/** Rotate the active selection 90° counter-clockwise, else the whole image. */
export const rotateCcw = (
	doc: SpriteDocument,
	history: History,
	selection: SelectionController | null,
): void => {
	if (selection?.rotateCcw()) {
		return;
	}
	rotateImageCcw(doc, history);
};

const clone = (buffer: PixelBuffer): PixelBuffer => ({
	width: buffer.width,
	height: buffer.height,
	data: new Uint8ClampedArray(buffer.data),
});

/**
 * Shift the active cel's pixels by `(dx, dy)` with wraparound — the seamless-tile
 * tool — as one {@link runCommand} undo entry. Whole-cel (active layer + active
 * frame); a no-op offset or an empty cel records nothing. Any pending float is
 * committed first (the {@link runCommand} choke-point). Selection-scoped
 * wrapping is intentionally not implemented (flagged).
 */
export const wrapShiftCel = (
	doc: SpriteDocument,
	history: History,
	dx: number,
	dy: number,
): void => {
	if (dx === 0 && dy === 0) {
		return;
	}
	const layerId = doc.activeLayerId;
	const frame = doc.activeFrameIndex;
	const cel = doc.getCel(layerId, frame);
	if (!cel) {
		return;
	}
	const before = clone(cel);
	const after = wrapShift(cel, dx, dy);
	runCommand(doc, history, {
		redo: () => doc.setCel(layerId, frame, clone(after)),
		undo: () => doc.setCel(layerId, frame, clone(before)),
	});
};
