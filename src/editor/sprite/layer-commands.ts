import type { History } from "../history";
import type { BlendMode } from "./blend-modes";
import type { SpriteDocument } from "./sprite-document";

const mutate = (
	doc: SpriteDocument,
	history: History,
	apply: () => void,
): void => {
	const before = doc.captureState();
	apply();
	const after = doc.captureState();
	history.push({
		undo: () => doc.restoreState(before),
		redo: () => doc.restoreState(after),
	});
};

export const addLayer = (
	doc: SpriteDocument,
	history: History,
): void => {
	mutate(doc, history, () => doc.addLayer());
};

export const deleteLayer = (
	doc: SpriteDocument,
	history: History,
	id: string,
): void => {
	if (doc.layers.length <= 1) {
		return;
	}
	mutate(doc, history, () => doc.deleteLayer(id));
};

export const renameLayer = (
	doc: SpriteDocument,
	history: History,
	id: string,
	name: string,
): void => {
	mutate(doc, history, () => doc.renameLayer(id, name));
};

export const setLayerBlend = (
	doc: SpriteDocument,
	history: History,
	id: string,
	blend: BlendMode,
): void => {
	mutate(doc, history, () => doc.setBlend(id, blend));
};

export const setLayerVisible = (
	doc: SpriteDocument,
	history: History,
	id: string,
	visible: boolean,
): void => {
	mutate(doc, history, () => doc.setVisible(id, visible));
};

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
	history.push({
		undo: () => doc.setLayerOrder(before),
		redo: () => doc.setLayerOrder(after),
	});
};

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
	history.push({
		undo: () => doc.setOpacity(id, before),
		redo: () => doc.setOpacity(id, after),
	});
};
