import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteEditCore } from "./sprite-edit-core";

/**
 * Tag edits, each routed through {@link runCommand} with a **real inverse**.
 * Tags are identified by their index in the ordered list; the timeline UI
 * (step 16) calls these factories. All inverses are metadata-only.
 */

/** Append a new tag; the inverse removes it. */
export const createTag = (
	core: SpriteEditCore,
	history: History,
	tag: BspriteTag,
): void => {
	const index = core.tags.length;
	runCommand(core, history, {
		redo: () => core.appendTag(tag),
		undo: () => {
			core.removeTag(index);
		},
	});
};

/** Delete the tag at `index`; the inverse re-inserts it at that index. */
export const deleteTag = (
	core: SpriteEditCore,
	history: History,
	index: number,
): void => {
	const tag = core.tags[index];
	if (!tag) {
		return;
	}
	const snapshot: BspriteTag = { ...tag };
	runCommand(core, history, {
		redo: () => {
			core.removeTag(index);
		},
		undo: () => core.insertTag(index, snapshot),
	});
};

/** Rename the tag at `index`; the inverse restores the prior name. */
export const renameTag = (
	core: SpriteEditCore,
	history: History,
	index: number,
	name: string,
): void => {
	const before = core.tags[index]?.name;
	if (before === undefined || before === name) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.renameTag(index, name),
		undo: () => core.renameTag(index, before),
	});
};

/** Set the tag's inclusive frame range; the inverse restores the prior range. */
export const setTagRange = (
	core: SpriteEditCore,
	history: History,
	index: number,
	from: number,
	to: number,
): void => {
	const tag = core.tags[index];
	if (!tag || (tag.from === from && tag.to === to)) {
		return;
	}
	const beforeFrom = tag.from;
	const beforeTo = tag.to;
	runCommand(core, history, {
		redo: () => core.setTagRange(index, from, to),
		undo: () => core.setTagRange(index, beforeFrom, beforeTo),
	});
};

/** Toggle the tag's loop flag; the inverse restores the prior value. */
export const setTagLoop = (
	core: SpriteEditCore,
	history: History,
	index: number,
	loop: boolean,
): void => {
	const before = core.tags[index]?.loop;
	if (before === undefined || before === loop) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.setTagLoop(index, loop),
		undo: () => core.setTagLoop(index, before),
	});
};
