import type { BspritePoint } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteDocument } from "./sprite-document";

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
	doc: SpriteDocument,
	history: History,
	name: string,
): void => {
	if (doc.attachmentNames().includes(name)) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.createAttachment(name),
		undo: () => doc.deleteAttachment(name),
	});
};

/**
 * Delete an attachment name and every per-frame point under it. The inverse
 * restores the name with its captured points exactly.
 */
export const deleteAttachmentName = (
	doc: SpriteDocument,
	history: History,
	name: string,
): void => {
	const frames = doc.attachmentFrames(name);
	if (frames === undefined) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.deleteAttachment(name),
		undo: () => doc.restoreAttachment(name, frames),
	});
};

/**
 * Rename an attachment name, preserving its points. No-op when the source is
 * absent, unchanged, or the target name is already taken.
 */
export const renameAttachmentName = (
	doc: SpriteDocument,
	history: History,
	from: string,
	to: string,
): void => {
	const names = doc.attachmentNames();
	if (from === to || !names.includes(from) || names.includes(to)) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.renameAttachment(from, to),
		undo: () => doc.renameAttachment(to, from),
	});
};

/**
 * Set (or move) the point for a name on a frame. The inverse restores the name's
 * prior state exactly — the previous point, an absent point, or (when this
 * command first created the name) the name's absence.
 */
export const setAttachmentPoint = (
	doc: SpriteDocument,
	history: History,
	name: string,
	frame: number,
	point: BspritePoint,
): void => {
	const beforePoint = doc.attachmentPoint(name, frame);
	if (
		beforePoint &&
		beforePoint.x === point.x &&
		beforePoint.y === point.y
	) {
		return;
	}
	const existed = doc.attachmentNames().includes(name);
	const before = doc.attachmentFrames(name);
	runCommand(doc, history, {
		redo: () => doc.setAttachmentPoint(name, frame, point),
		undo: () => {
			if (existed && before) {
				doc.restoreAttachment(name, before);
			} else {
				doc.deleteAttachment(name);
			}
		},
	});
};

/**
 * Clear the point for a name on a frame (the name is kept). No-op when the frame
 * has no point. The inverse restores the cleared point.
 */
export const clearAttachmentPoint = (
	doc: SpriteDocument,
	history: History,
	name: string,
	frame: number,
): void => {
	const before = doc.attachmentPoint(name, frame);
	if (before === undefined) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.clearAttachmentPoint(name, frame),
		undo: () => doc.setAttachmentPoint(name, frame, before),
	});
};
