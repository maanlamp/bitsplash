import type { BlendId } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteEditCore } from "./sprite-edit-core";

/**
 * Structural layer edits, each pushed as a command with a **real inverse** — the
 * minimal metadata (or, for delete, a single cel's pixels) needed to undo — and
 * routed through {@link runCommand}. None of these capture the whole document;
 * that ~16 MB-per-edit snapshot is retired. This is the pattern Phase 1's
 * cel/tag/timing edits follow: a `{ redo, undo }` pair of the smallest inverse,
 * handed to {@link runCommand}.
 */

/** Add a new blank layer above the current one and make it active. */
export const addLayer = (
	core: SpriteEditCore,
	history: History,
): void => {
	const snapshot = core.blankLayerSnapshot();
	const index = core.layers.length;
	const activeBefore = core.activeLayerId;
	runCommand(core, history, {
		redo: () => {
			core.insertLayer(snapshot, index);
			core.setActiveLayer(snapshot.id);
		},
		undo: () => {
			core.removeLayer(snapshot.id);
			core.setActiveLayer(activeBefore);
		},
	});
};

/**
 * Delete a layer. The inverse re-inserts it at its original index with its
 * pixels and properties intact — the one structural command that carries a
 * cel-scoped pixel snapshot. Refuses to delete the last remaining layer.
 */
export const deleteLayer = (
	core: SpriteEditCore,
	history: History,
	id: string,
): void => {
	if (core.layers.length <= 1) {
		return;
	}
	const index = core.layerIndex(id);
	if (index < 0) {
		return;
	}
	const snapshot = core.snapshotLayer(id);
	if (!snapshot) {
		return;
	}
	const activeBefore = core.activeLayerId;
	runCommand(core, history, {
		redo: () => core.removeLayer(id),
		undo: () => {
			core.insertLayer(snapshot, index);
			core.setActiveLayer(activeBefore);
		},
	});
};

/** Rename a layer; the inverse renames it back. Captures no pixels. */
export const renameLayer = (
	core: SpriteEditCore,
	history: History,
	id: string,
	name: string,
): void => {
	const layer = core.layers.find((l) => l.id === id);
	if (!layer || layer.name === name) {
		return;
	}
	const before = layer.name;
	runCommand(core, history, {
		redo: () => core.renameLayer(id, name),
		undo: () => core.renameLayer(id, before),
	});
};

/** Set a layer's blend mode; the inverse restores the prior mode. */
export const setLayerBlend = (
	core: SpriteEditCore,
	history: History,
	id: string,
	blend: BlendId,
): void => {
	const layer = core.layers.find((l) => l.id === id);
	if (!layer || layer.blend === blend) {
		return;
	}
	const before = layer.blend;
	runCommand(core, history, {
		redo: () => core.setBlend(id, blend),
		undo: () => core.setBlend(id, before),
	});
};

/** Toggle a layer's visibility; the inverse restores the prior value. */
export const setLayerVisible = (
	core: SpriteEditCore,
	history: History,
	id: string,
	visible: boolean,
): void => {
	const layer = core.layers.find((l) => l.id === id);
	if (!layer || layer.visible === visible) {
		return;
	}
	const before = layer.visible;
	runCommand(core, history, {
		redo: () => core.setVisible(id, visible),
		undo: () => core.setVisible(id, before),
	});
};

/**
 * Record a completed layer reorder. The order is applied live during the drag;
 * this pushes the before/after order arrays as the command's real inverse. A
 * no-op reorder records nothing.
 */
export const commitLayerOrder = (
	core: SpriteEditCore,
	history: History,
	before: ReadonlyArray<string>,
	after: ReadonlyArray<string>,
): void => {
	if (
		before.length === after.length &&
		before.every((id, i) => id === after[i])
	) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.setLayerOrder(after),
		undo: () => core.setLayerOrder(before),
	});
};

/**
 * Record a completed opacity change. Opacity is applied live during the slider
 * drag; this pushes the before/after scalars as the command's real inverse. A
 * no-op change records nothing.
 */
export const commitLayerOpacity = (
	core: SpriteEditCore,
	history: History,
	id: string,
	before: number,
	after: number,
): void => {
	if (before === after) {
		return;
	}
	runCommand(core, history, {
		redo: () => core.setOpacity(id, after),
		undo: () => core.setOpacity(id, before),
	});
};
