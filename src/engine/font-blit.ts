import {
	UnicodeBuffer,
	glyphBufferToShapedGlyphs,
	shape,
} from "text-shaper";
import {
	type FontStyle,
	type LoadedFont,
	STYLE_REGULAR,
} from "./load";

export type BlitColor = Readonly<{ r: number; g: number; b: number }>;

const WHITE: BlitColor = { r: 255, g: 255, b: 255 };

export const supportsChar = (
	font: LoadedFont,
	char: string,
	style: FontStyle = STYLE_REGULAR,
): boolean => {
	const codePoint = char.codePointAt(0);
	if (codePoint === undefined) {
		return false;
	}
	const face = font.faces[style];
	const glyphId = face.shape.glyphId(codePoint);
	return glyphId !== 0 && face.glyphCache.has(glyphId);
};

type Placement = Readonly<{
	mask: Uint8Array;
	width: number;
	rows: number;
	drawX: number;
	drawY: number;
}>;

export const blitText = (
	font: LoadedFont,
	text: string,
	style: FontStyle = STYLE_REGULAR,
	color: BlitColor = WHITE,
): ImageData => {
	const face = font.faces[style];
	const buffer = new UnicodeBuffer();
	buffer.addStr(text);
	const glyphs = glyphBufferToShapedGlyphs(shape(face.shape, buffer));
	const scale = face.scale;
	const boldExtra = face.synthetic?.bold ? 1 : 0;
	const baseline = Math.round(font.ascent);
	const height = Math.max(1, Math.ceil(font.lineHeight));

	let cursorX = 0;
	let right = 0;
	const placements: Placement[] = [];
	for (const glyph of glyphs) {
		const variant = face.glyphCache.get(glyph.glyphId);
		if (variant) {
			const drawX = Math.round(cursorX + variant.bearingX);
			const drawY = baseline - Math.round(variant.bearingY);
			placements.push({
				mask: variant.mask,
				width: variant.width,
				rows: variant.rows,
				drawX,
				drawY,
			});
			right = Math.max(right, drawX + variant.width);
		}
		cursorX += glyph.xAdvance * scale + boldExtra;
	}

	const width = Math.max(1, Math.ceil(Math.max(cursorX, right)));
	const image = new ImageData(width, height);
	const data = image.data;
	for (const placement of placements) {
		const { mask, drawX, drawY } = placement;
		for (let row = 0; row < placement.rows; row++) {
			const py = drawY + row;
			if (py < 0 || py >= height) {
				continue;
			}
			for (let col = 0; col < placement.width; col++) {
				const alpha = mask[row * placement.width + col]!;
				if (alpha === 0) {
					continue;
				}
				const px = drawX + col;
				if (px < 0 || px >= width) {
					continue;
				}
				const i = (py * width + px) * 4;
				data[i] = color.r;
				data[i + 1] = color.g;
				data[i + 2] = color.b;
				data[i + 3] = alpha;
			}
		}
	}
	return image;
};
