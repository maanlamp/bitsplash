import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { DEFAULT_FRAME_DURATION_MS } from "./cel-store";
import { runCommand } from "./command-router";
import type { SpriteDocument } from "./sprite-document";

/**
 * Structural frame edits, each routed through {@link runCommand} with a **real
 * inverse** — the minimal metadata (or, for delete, the removed frame's
 * cel-scoped pixels) needed to undo. This follows `layer-commands.ts`; the
 * timeline UI (step 16) calls these factories rather than mutating the document.
 *
 * New-frame duration defaults to {@link DEFAULT_FRAME_DURATION_MS} (the
 * conventional Aseprite default). Deleting the last remaining frame is refused,
 * mirroring the last-layer guard.
 */

/** Add a blank frame immediately after `index`, defaulting to the active frame. */
export const addFrame = (
	doc: SpriteDocument,
	history: History,
	index: number = doc.activeFrameIndex,
): void => {
	const at = index + 1;
	runCommand(doc, history, {
		redo: () => doc.insertFrame(at, DEFAULT_FRAME_DURATION_MS),
		undo: () => {
			doc.removeFrame(at);
		},
	});
};

/**
 * Delete the frame at `index`. The inverse restores it — duration, per-layer
 * cels, and the tag list as it stood — so a delete that clamped a tag range
 * undoes exactly. Refuses to delete the last remaining frame.
 */
export const deleteFrame = (
	doc: SpriteDocument,
	history: History,
	index: number,
): void => {
	if (
		doc.frames.length <= 1 ||
		index < 0 ||
		index >= doc.frames.length
	) {
		return;
	}
	const removed = doc.peekFrame(index);
	const tagsBefore: BspriteTag[] = doc.tags.map((tag) => ({
		...tag,
	}));
	runCommand(doc, history, {
		redo: () => {
			doc.removeFrame(index);
		},
		undo: () => {
			doc.insertFrameSnapshot(index, removed);
			doc.replaceTags(tagsBefore);
		},
	});
};

/** Duplicate the frame at `index`, inserting the copy right after it. */
export const duplicateFrame = (
	doc: SpriteDocument,
	history: History,
	index: number,
): void => {
	if (index < 0 || index >= doc.frames.length) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.duplicateFrame(index),
		undo: () => {
			doc.removeFrame(index + 1);
		},
	});
};

/** Move the frame at `from` to `to`; the inverse moves it back. */
export const moveFrame = (
	doc: SpriteDocument,
	history: History,
	from: number,
	to: number,
): void => {
	if (
		from === to ||
		from < 0 ||
		to < 0 ||
		from >= doc.frames.length ||
		to >= doc.frames.length
	) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.moveFrame(from, to),
		undo: () => doc.moveFrame(to, from),
	});
};

/** Set a frame's display duration (ms); the inverse restores the prior value. */
export const setFrameDuration = (
	doc: SpriteDocument,
	history: History,
	index: number,
	duration: number,
): void => {
	const before = doc.frames[index]?.duration;
	if (before === undefined || before === duration || duration <= 0) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.setFrameDuration(index, duration),
		undo: () => doc.setFrameDuration(index, before),
	});
};
