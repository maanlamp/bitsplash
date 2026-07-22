import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteDocument } from "./sprite-document";

/**
 * Tag edits, each routed through {@link runCommand} with a **real inverse**.
 * Tags are identified by their index in the ordered list; the timeline UI
 * (step 16) calls these factories. All inverses are metadata-only.
 */

/** Append a new tag; the inverse removes it. */
export const createTag = (
	doc: SpriteDocument,
	history: History,
	tag: BspriteTag,
): void => {
	const index = doc.tags.length;
	runCommand(doc, history, {
		redo: () => doc.appendTag(tag),
		undo: () => {
			doc.removeTag(index);
		},
	});
};

/** Delete the tag at `index`; the inverse re-inserts it at that index. */
export const deleteTag = (
	doc: SpriteDocument,
	history: History,
	index: number,
): void => {
	const tag = doc.tags[index];
	if (!tag) {
		return;
	}
	const snapshot: BspriteTag = { ...tag };
	runCommand(doc, history, {
		redo: () => {
			doc.removeTag(index);
		},
		undo: () => doc.insertTag(index, snapshot),
	});
};

/** Rename the tag at `index`; the inverse restores the prior name. */
export const renameTag = (
	doc: SpriteDocument,
	history: History,
	index: number,
	name: string,
): void => {
	const before = doc.tags[index]?.name;
	if (before === undefined || before === name) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.renameTag(index, name),
		undo: () => doc.renameTag(index, before),
	});
};

/** Set the tag's inclusive frame range; the inverse restores the prior range. */
export const setTagRange = (
	doc: SpriteDocument,
	history: History,
	index: number,
	from: number,
	to: number,
): void => {
	const tag = doc.tags[index];
	if (!tag || (tag.from === from && tag.to === to)) {
		return;
	}
	const beforeFrom = tag.from;
	const beforeTo = tag.to;
	runCommand(doc, history, {
		redo: () => doc.setTagRange(index, from, to),
		undo: () => doc.setTagRange(index, beforeFrom, beforeTo),
	});
};

/** Toggle the tag's loop flag; the inverse restores the prior value. */
export const setTagLoop = (
	doc: SpriteDocument,
	history: History,
	index: number,
	loop: boolean,
): void => {
	const before = doc.tags[index]?.loop;
	if (before === undefined || before === loop) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.setTagLoop(index, loop),
		undo: () => doc.setTagLoop(index, before),
	});
};
