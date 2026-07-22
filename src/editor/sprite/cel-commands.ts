import type { History } from "../history";
import { runCommand } from "./command-router";
import type { PixelBuffer } from "./pixel-buffer";
import type { SpriteDocument } from "./sprite-document";

/** A (layer, frame) address of a single cel in the timeline grid. */
export type CelRef = Readonly<{
	layerId: string;
	frameIndex: number;
}>;

/**
 * Move — or, when `copy`, clone — a cel's pixels from `src` to `dst`, routed
 * through {@link runCommand} with a **real inverse**. The inverse restores both
 * endpoints to the exact buffers they held before (the destination's prior
 * contents included), so a move that overwrote a populated cell undoes cleanly.
 *
 * Records nothing for a no-op: a drop onto the same cell, or dragging an empty
 * (absent) source cel. Because {@link CelStore} never mutates a stored buffer in
 * place, the captured `before` references stay valid without defensive copies.
 *
 * The timeline UI (step 16) wires this to a cel drag: drag = move, `Alt`-drop =
 * copy (the conventional pixel-editor default — flagged for the user).
 */
export const moveCel = (
	doc: SpriteDocument,
	history: History,
	src: CelRef,
	dst: CelRef,
	copy: boolean,
): void => {
	if (
		src.layerId === dst.layerId &&
		src.frameIndex === dst.frameIndex
	) {
		return;
	}
	const srcBefore: PixelBuffer | null = doc.getCel(
		src.layerId,
		src.frameIndex,
	);
	if (!srcBefore) {
		return;
	}
	const dstBefore: PixelBuffer | null = doc.getCel(
		dst.layerId,
		dst.frameIndex,
	);
	runCommand(doc, history, {
		redo: () =>
			doc.moveCel(
				src.layerId,
				src.frameIndex,
				dst.layerId,
				dst.frameIndex,
				copy,
			),
		undo: () => {
			doc.setCel(dst.layerId, dst.frameIndex, dstBefore);
			doc.setCel(src.layerId, src.frameIndex, srcBefore);
		},
	});
};
