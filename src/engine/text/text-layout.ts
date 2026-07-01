import {
	UnicodeBuffer,
	glyphBufferToShapedGlyphs,
	shape,
} from "text-shaper";
import { type LoadedFont, STYLE_REGULAR } from "../load";

export const measureText = (
	font: LoadedFont,
	text: string,
): number => {
	if (text.length === 0) {
		return 0;
	}
	const face = font.faces[STYLE_REGULAR];
	const buffer = new UnicodeBuffer();
	buffer.addStr(text);
	const glyphs = glyphBufferToShapedGlyphs(shape(face.shape, buffer));
	const scale = face.scale;
	let total = 0;
	for (const g of glyphs) {
		total += g.xAdvance;
	}
	return total * scale;
};

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
