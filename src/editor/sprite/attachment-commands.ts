import type { BspritePoint } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteEditCore } from "./sprite-edit-core";

/**
 * Attachment-point edits, each routed through {@link runCommand} with a **real
 * inverse**, following the `tag-commands.ts` style. Attachments are pure
 * manifest metadata (no cel/bake pixels), so every inverse is metadata-only.
 *
 * A "name" is a named point (e.g. `grip`) that carries a sparse set of per-frame
 * points; the set/clear commands edit a single frame's point under a name, the
 * name commands manage the names themselves.
 */

/** Create an empty attachment name; the inverse deletes it. No-op if it exists. */
export const createAttachmentName = (
	core: SpriteEditCore,
	history: History,
	name: string,
): void => {
	if (core.attachmentNames().includes(name)) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.createAttachment(name),
		undo: () => core.deleteAttachment(name),
	});
};

/**
 * Delete an attachment name and every per-frame point under it. The inverse
 * restores the name with its captured points exactly.
 */
export const deleteAttachmentName = (
	core: SpriteEditCore,
	history: History,
	name: string,
): void => {
	const frames = core.attachmentFrames(name);
	if (frames === undefined) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.deleteAttachment(name),
		undo: () => core.restoreAttachment(name, frames),
	});
};

/**
 * Rename an attachment name, preserving its points. No-op when the source is
 * absent, unchanged, or the target name is already taken.
 */
export const renameAttachmentName = (
	core: SpriteEditCore,
	history: History,
	from: string,
	to: string,
): void => {
	const names = core.attachmentNames();
	if (from === to || !names.includes(from) || names.includes(to)) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.renameAttachment(from, to),
		undo: () => core.renameAttachment(to, from),
	});
};

/**
 * Set (or move) the point for a name on a frame. The inverse restores the name's
 * prior state exactly — the previous point, an absent point, or (when this
 * command first created the name) the name's absence.
 */
export const setAttachmentPoint = (
	core: SpriteEditCore,
	history: History,
	name: string,
	frame: number,
	point: BspritePoint,
): void => {
	const beforePoint = core.attachmentPoint(name, frame);
	if (
		beforePoint &&
		beforePoint.x === point.x &&
		beforePoint.y === point.y
	) {
		return;
	}
	const existed = core.attachmentNames().includes(name);
	const before = core.attachmentFrames(name);
	runCommand(core, history, {
		redo: () => core.setAttachmentPoint(name, frame, point),
		undo: () => {
			if (existed && before) {
				core.restoreAttachment(name, before);
			} else {
				core.deleteAttachment(name);
			}
		},
	});
};

/**
 * Clear the point for a name on a frame (the name is kept). No-op when the frame
 * has no point. The inverse restores the cleared point.
 */
export const clearAttachmentPoint = (
	core: SpriteEditCore,
	history: History,
	name: string,
	frame: number,
): void => {
	const before = core.attachmentPoint(name, frame);
	if (before === undefined) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.clearAttachmentPoint(name, frame),
		undo: () => core.setAttachmentPoint(name, frame, before),
	});
};
