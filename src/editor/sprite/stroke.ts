import type { History } from "../history";
import { runCommand } from "./command-router";
import type { PixelBuffer } from "./pixel-buffer";
import type {
	SpriteDocument,
	StrokeSnapshot,
} from "./sprite-document";

const equal = (a: PixelBuffer, b: PixelBuffer): boolean => {
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

/**
 * Record a committed stroke on the undo stack as one cel-scoped pixel command.
 * Snapshots the active layer after {@link SpriteDocument.commitStroke} has
 * folded the stroke buffer in, diffs it against the pre-stroke `before`
 * snapshot, and — via the shared {@link runCommand} choke-point — pushes an
 * undo/redo pair over just that one cel's {@link ImageData}; a stroke that
 * changed nothing pushes nothing.
 *
 * The stroke is already committed to the layer by the time this runs, so
 * `runCommand`'s initial `redo` re-applies the identical pixels (a no-op); the
 * point of routing through it is that the floating-commit and selection hooks
 * fire uniformly for pixel and structural edits alike.
 */
export const recordStroke = (
	doc: SpriteDocument,
	history: History,
	before: StrokeSnapshot,
): void => {
	const after = doc.snapshot();
	if (
		before.layerId === after.layerId &&
		before.frameIndex === after.frameIndex &&
		equal(before.data, after.data)
	) {
		return;
	}
	runCommand(doc, history, {
		redo: () => doc.restore(after),
		undo: () => doc.restore(before),
	});
};
