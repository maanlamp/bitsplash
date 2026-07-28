import type { EmotionId } from "../character/emotion-ids";
import type { IconCell } from "../ui/input-icon-atlas";

/** Side of one square icon cell, in atlas pixels. */
export const EMOTION_ICON_SIZE = 16;

/** Cells per atlas row; the last row may be short. */
export const EMOTION_ICON_COLUMNS = 4;

/**
 * The cell maths, the same row-major walk `input-icon-atlas.ts`'s `iconCell`
 * does — reused for the arithmetic only. Taking a raw index is why it is
 * private to this module: {@link EMOTION_CELLS} is the sole way to address a
 * cell, so no call site can pass a number.
 */
const cell = (index: number): IconCell => ({
	srcX: (index % EMOTION_ICON_COLUMNS) * EMOTION_ICON_SIZE,
	srcY: Math.floor(index / EMOTION_ICON_COLUMNS) * EMOTION_ICON_SIZE,
	srcW: EMOTION_ICON_SIZE,
	srcH: EMOTION_ICON_SIZE,
});

/**
 * Which crop of `emotions.icons.png` each emotion draws.
 *
 * A total `Record` over {@link EmotionId}, so adding an emotion to
 * `EMOTION_IDS` fails at `tsc` here until it is given a cell — a missing icon
 * can never reach runtime as a wrong crop.
 *
 * This table is also the atlas's **source of truth**:
 * `scripts/gen-emotion-icons.ts` reads it to place every glyph and asserts the
 * cells are unique and fill the sheet exactly.
 *
 * @example
 * const { srcX, srcY, srcW, srcH } = EMOTION_CELLS[reaction.emotion];
 */
export const EMOTION_CELLS: Record<EmotionId, IconCell> = {
	neutral: cell(0),
	happy: cell(1),
	sad: cell(2),
	angry: cell(3),
	surprised: cell(4),
	afraid: cell(5),
	curious: cell(6),
	thinking: cell(7),
	smug: cell(8),
	embarrassed: cell(9),
	hurt: cell(10),
	determined: cell(11),
};
