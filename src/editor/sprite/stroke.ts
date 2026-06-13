import type { History } from "../history";
import type {
	SpriteDocument,
	StrokeSnapshot,
} from "./sprite-document";

const equal = (a: ImageData, b: ImageData): boolean => {
	if (a.data.length !== b.data.length) {
		return false;
	}
	for (let i = 0; i < a.data.length; i++) {
		if (a.data[i] !== b.data[i]) {
			return false;
		}
	}
	return true;
};

export const commitStroke = (
	doc: SpriteDocument,
	history: History,
	before: StrokeSnapshot,
): void => {
	const after = doc.snapshot();
	if (
		before.layerId === after.layerId &&
		equal(before.data, after.data)
	) {
		return;
	}
	history.push({
		undo: () => doc.restore(before),
		redo: () => doc.restore(after),
	});
};
