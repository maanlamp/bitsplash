import type { History } from "../history";
import { runCommand } from "./command-router";
import type { PixelBuffer } from "./pixel-buffer";
import type { SpriteEditCore } from "./sprite-edit-core";

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
	core: SpriteEditCore,
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
	const srcBefore: PixelBuffer | null = core.getCel(
		src.layerId,
		src.frameIndex,
	);
	if (!srcBefore) {
		return;
	}
	const dstBefore: PixelBuffer | null = core.getCel(
		dst.layerId,
		dst.frameIndex,
	);
	runCommand(core, history, {
		redo: () =>
			core.moveCel(
				src.layerId,
				src.frameIndex,
				dst.layerId,
				dst.frameIndex,
				copy,
			),
		undo: () => {
			core.setCel(dst.layerId, dst.frameIndex, dstBefore);
			core.setCel(src.layerId, src.frameIndex, srcBefore);
		},
	});
};
