import {
	type FontStyle,
	type LoadedFont,
	STYLE_REGULAR,
} from "../load";
import { shapeRun } from "./shape-cache";

/**
 * How wide `text` is in `font`'s `style`, in pixels.
 *
 * **The one place text width is defined.** Measuring, wrapping, rich-text
 * layout and the atlas's own alignment all come through here, because three
 * copies of this arithmetic meant a string could measure one width and draw at
 * another — which is exactly what happened: a copy that ignored synthetic bold
 * under-measured bold runs by a pixel a glyph.
 *
 * Synthetic bold is a face the font does not ship, faked by smearing the
 * regular one, and the smear makes each glyph a pixel wider than its shaped
 * advance claims.
 *
 * @example
 * const width = measureText(font, label, STYLE_BOLD);
 */
export const measureText = (
	font: LoadedFont,
	text: string,
	style: FontStyle = STYLE_REGULAR,
): number => {
	if (text.length === 0) {
		return 0;
	}
	const face = font.faces[style];
	const run = shapeRun(font, style, text);
	return (
		run.totalAdvance * face.scale +
		syntheticBoldExtra(face) * run.ids.length
	);
};

/** Extra width per glyph a synthetically-bolded face needs. */
export const syntheticBoldExtra = (
	face: LoadedFont["faces"][FontStyle],
): number => (face.synthetic?.bold ? 1 : 0);

export const wrapText = (
	font: LoadedFont,
	text: string,
	maxWidth: number,
): string[] => {
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
		let line = "";
		for (const word of words) {
			const candidate = line.length === 0 ? word : `${line} ${word}`;
			if (
				line.length > 0 &&
				measureText(font, candidate) > maxWidth
			) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		}
		lines.push(line);
	}
	return lines;
};
