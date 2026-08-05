import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { DEFAULT_FRAME_DURATION_MS } from "./cel-store";
import { runCommand } from "./command-router";
import type { SpriteEditCore } from "./sprite-edit-core";

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
	core: SpriteEditCore,
	history: History,
	index: number = core.activeFrameIndex,
): void => {
	const at = index + 1;
	runCommand(core, history, {
		redo: () => core.insertFrame(at, DEFAULT_FRAME_DURATION_MS),
		undo: () => {
			core.removeFrame(at);
		},
	});
};

/**
 * Delete the frame at `index`. The inverse restores it — duration, per-layer
 * cels, and the tag list as it stood — so a delete that clamped a tag range
 * undoes exactly. Refuses to delete the last remaining frame.
 */
export const deleteFrame = (
	core: SpriteEditCore,
	history: History,
	index: number,
): void => {
	if (
		core.frames.length <= 1 ||
		index < 0 ||
		index >= core.frames.length
	) {
		return;
	}
	const removed = core.peekFrame(index);
	const tagsBefore: BspriteTag[] = core.tags.map((tag) => ({
		...tag,
	}));
	runCommand(core, history, {
		redo: () => {
			core.removeFrame(index);
		},
		undo: () => {
			core.insertFrameSnapshot(index, removed);
			core.replaceTags(tagsBefore);
		},
	});
};

/** Duplicate the frame at `index`, inserting the copy right after it. */
export const duplicateFrame = (
	core: SpriteEditCore,
	history: History,
	index: number,
): void => {
	if (index < 0 || index >= core.frames.length) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.duplicateFrame(index),
		undo: () => {
			core.removeFrame(index + 1);
		},
	});
};

/** Move the frame at `from` to `to`; the inverse moves it back. */
export const moveFrame = (
	core: SpriteEditCore,
	history: History,
	from: number,
	to: number,
): void => {
	if (
		from === to ||
		from < 0 ||
		to < 0 ||
		from >= core.frames.length ||
		to >= core.frames.length
	) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.moveFrame(from, to),
		undo: () => core.moveFrame(to, from),
	});
};

/** Set a frame's display duration (ms); the inverse restores the prior value. */
export const setFrameDuration = (
	core: SpriteEditCore,
	history: History,
	index: number,
	duration: number,
): void => {
	const before = core.frames[index]?.duration;
	if (before === undefined || before === duration || duration <= 0) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.setFrameDuration(index, duration),
		undo: () => core.setFrameDuration(index, before),
	});
};
