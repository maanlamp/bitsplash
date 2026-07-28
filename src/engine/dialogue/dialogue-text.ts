import type { LoadedFont } from "../load";
import {
	parseRichText,
	type RichLine,
	wrapRichText,
} from "../text/rich-text";

/** How long the typewriter dwells on each kind of punctuation, in characters. */
export type PauseBindings = Readonly<{
	commaPauseChars: number;
	midPauseChars: number;
	stopPauseChars: number;
	ellipsisPauseChars: number;
}>;

/**
 * One message's text laid out for the typewriter: per-glyph parallel arrays,
 * indexed the same way `DialogueComponent.revealed` counts.
 *
 * The wrapped lines themselves are not kept — the conversation panel wraps what
 * it paints (`ConversationWraps`), so a second copy here would be a display
 * artefact nobody reads.
 *
 * `source` is the text it was built from, so a holder can tell a stale wrap from
 * a current one.
 */
export type WrappedText = Readonly<{
	source: string;
	chars: string[];
	speeds: number[];
	pauses: number[];
}>;

const COMMA_MARKS = new Set([",", "–", "—"]);
const MID_MARKS = new Set([";", ":"]);
const STOP_MARKS = new Set([".", "!", "?"]);

/**
 * Extra dwell, in characters, after each glyph — longer after a full stop than a
 * comma, longest after an ellipsis. Runs of the same mark collapse onto the last
 * glyph of the run.
 */
const computePauses = (
	chars: readonly string[],
	bindings: PauseBindings,
): number[] => {
	const pauses = Array.from<number>({ length: chars.length }).fill(0);
	let i = 0;
	while (i < chars.length) {
		const char = chars[i]!;
		if (STOP_MARKS.has(char)) {
			let j = i;
			while (j + 1 < chars.length && STOP_MARKS.has(chars[j + 1]!)) {
				j++;
			}
			const run = chars.slice(i, j + 1);
			const ellipsis = run.length >= 2 && run.every((c) => c === ".");
			pauses[j] = ellipsis
				? bindings.ellipsisPauseChars
				: bindings.stopPauseChars;
			i = j + 1;
		} else if (MID_MARKS.has(char)) {
			pauses[i] = bindings.midPauseChars;
			i++;
		} else if (COMMA_MARKS.has(char)) {
			let j = i;
			while (j + 1 < chars.length && COMMA_MARKS.has(chars[j + 1]!)) {
				j++;
			}
			pauses[j] = bindings.commaPauseChars;
			i = j + 1;
		} else {
			i++;
		}
	}
	return pauses;
};

const richChars = (lines: readonly RichLine[]): string[] =>
	lines.flatMap((line) => line.glyphs.map((glyph) => glyph.char));

const richSpeeds = (lines: readonly RichLine[]): number[] =>
	lines.flatMap((line) => line.glyphs.map((glyph) => glyph.speed));

/** An empty layout, for a message with no text yet — needs no loaded font. */
export const EMPTY_WRAPPED_TEXT: WrappedText = {
	source: "",
	chars: [],
	speeds: [],
	pauses: [],
};

/**
 * Parse rich-text markup, wrap it to `maxWidth`, and derive the typewriter's
 * per-glyph char, speed and pause arrays.
 *
 * @example
 * const wrapped = wrapDialogueText(state.text, font, 248, bindings);
 * state.complete = state.revealed >= wrapped.chars.length;
 */
export const wrapDialogueText = (
	text: string,
	font: LoadedFont,
	maxWidth: number,
	bindings: PauseBindings,
): WrappedText => {
	const lines = wrapRichText(font, parseRichText(text), maxWidth);
	const chars = richChars(lines);
	return {
		source: text,
		chars,
		speeds: richSpeeds(lines),
		pauses: computePauses(chars, bindings),
	};
};
