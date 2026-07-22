import type { BlendId } from "../../engine/sprite/bsprite-manifest";
import type { History } from "../history";
import { runCommand } from "./command-router";
import type { SpriteDocument } from "./sprite-document";

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
	doc: SpriteDocument,
	history: History,
): void => {
	const snapshot = doc.blankLayerSnapshot();
	const index = doc.layers.length;
	const activeBefore = doc.activeLayerId;
	runCommand(doc, history, {
		redo: () => {
			doc.insertLayer(snapshot, index);
			doc.setActiveLayer(snapshot.id);
		},
		undo: () => {
			doc.removeLayer(snapshot.id);
			doc.setActiveLayer(activeBefore);
		},
	});
};

/**
 * Delete a layer. The inverse re-inserts it at its original index with its
 * pixels and properties intact — the one structural command that carries a
 * cel-scoped pixel snapshot. Refuses to delete the last remaining layer.
 */
export const deleteLayer = (
	doc: SpriteDocument,
	history: History,
	id: string,
): void => {
	if (doc.layers.length <= 1) {
		return;
	}
	const index = doc.layerIndex(id);
	if (index < 0) {
		return;
	}
	const snapshot = doc.snapshotLayer(id);
	if (!snapshot) {
		return;
	}
	const activeBefore = doc.activeLayerId;
	runCommand(doc, history, {
		redo: () => doc.removeLayer(id),
		undo: () => {
			doc.insertLayer(snapshot, index);
			doc.setActiveLayer(activeBefore);
		},
	});
};

/** Rename a layer; the inverse renames it back. Captures no pixels. */
export const renameLayer = (
	doc: SpriteDocument,
	history: History,
	id: string,
	name: string,
): void => {
	const layer = doc.layers.find((l) => l.id === id);
	if (!layer || layer.name === name) {
		return;
	}
	const before = layer.name;
	runCommand(doc, history, {
		redo: () => doc.renameLayer(id, name),
		undo: () => doc.renameLayer(id, before),
	});
};

/** Set a layer's blend mode; the inverse restores the prior mode. */
export const setLayerBlend = (
	doc: SpriteDocument,
	history: History,
	id: string,
	blend: BlendId,
): void => {
	const layer = doc.layers.find((l) => l.id === id);
	if (!layer || layer.blend === blend) {
		return;
	}
	const before = layer.blend;
	runCommand(doc, history, {
		redo: () => doc.setBlend(id, blend),
		undo: () => doc.setBlend(id, before),
	});
};

/** Toggle a layer's visibility; the inverse restores the prior value. */
export const setLayerVisible = (
	doc: SpriteDocument,
	history: History,
	id: string,
	visible: boolean,
): void => {
	const layer = doc.layers.find((l) => l.id === id);
	if (!layer || layer.visible === visible) {
		return;
	}
	const before = layer.visible;
	runCommand(doc, history, {
		redo: () => doc.setVisible(id, visible),
		undo: () => doc.setVisible(id, before),
	});
};

/**
 * Record a completed layer reorder. The order is applied live during the drag;
 * this pushes the before/after order arrays as the command's real inverse. A
 * no-op reorder records nothing.
 */
export const commitLayerOrder = (
	doc: SpriteDocument,
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
	runCommand(doc, history, {
		redo: () => doc.setLayerOrder(after),
		undo: () => doc.setLayerOrder(before),
	});
};

/**
 * Record a completed opacity change. Opacity is applied live during the slider
 * drag; this pushes the before/after scalars as the command's real inverse. A
 * no-op change records nothing.
 */
export const commitLayerOpacity = (
	doc: SpriteDocument,
	history: History,
	id: string,
	before: number,
	after: number,
): void => {
	if (before === after) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.setOpacity(id, after),
		undo: () => doc.setOpacity(id, before),
	});
};
