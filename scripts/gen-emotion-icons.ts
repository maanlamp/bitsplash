import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodePng } from "../src/editor/sprite/png-codec";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";
import {
	EMOTION_IDS,
	type EmotionId,
} from "../src/game/character/emotion-ids";
import {
	EMOTION_CELLS,
	EMOTION_ICON_COLUMNS,
	EMOTION_ICON_SIZE as SIZE,
} from "../src/game/reaction/emotion-icon-atlas";

const OUT_FILE = fileURLToPath(
	new URL(
		"../src/game/content/assets/emotions.icons.png",
		import.meta.url,
	),
);

const GLYPH: readonly [number, number, number, number] = [
	255, 255, 255, 255,
];
const OUTLINE: readonly [number, number, number, number] = [
	0, 0, 0, 255,
];

/**
 * A one-bit stencil for a single cell. Placeholder glyphs are shapes, not art,
 * so a mask plus a one-pixel dilated outline is the whole rendering model.
 */
type Mask = boolean[];

const blankMask = (): Mask =>
	Array.from({ length: SIZE * SIZE }, () => false);

const plot = (mask: Mask, x: number, y: number): void => {
	if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
		return;
	}
	mask[y * SIZE + x] = true;
};

const box = (
	mask: Mask,
	x: number,
	y: number,
	w: number,
	h: number,
): void => {
	for (let dy = 0; dy < h; dy++) {
		for (let dx = 0; dx < w; dx++) {
			plot(mask, x + dx, y + dy);
		}
	}
};

const stroke = (
	mask: Mask,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): void => {
	const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
	for (let i = 0; i <= steps; i++) {
		const t = steps === 0 ? 0 : i / steps;
		plot(
			mask,
			Math.round(x0 + (x1 - x0) * t),
			Math.round(y0 + (y1 - y0) * t),
		);
	}
};

/** A stroke thickened downward by one pixel, so thin diagonals stay legible. */
const thickStroke = (
	mask: Mask,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): void => {
	stroke(mask, x0, y0, x1, y1);
	stroke(mask, x0, y0 + 1, x1, y1 + 1);
};

/**
 * Twelve crude but distinguishable placeholder glyphs — debug art, in the same
 * spirit as the generated bubble frame and the portrait crop. Shapes rather
 * than faces: a 16×16 one-bit face cannot separate twelve emotions, whereas
 * twelve distinct symbols can.
 *
 * A total `Record`, so an emotion added to `EMOTION_IDS` fails here at `tsc`
 * as well as in `EMOTION_CELLS`.
 */
const GLYPHS: Record<EmotionId, (mask: Mask) => void> = {
	neutral: (m) => {
		box(m, 3, 7, 10, 2);
	},
	happy: (m) => {
		thickStroke(m, 3, 5, 5, 9);
		box(m, 5, 9, 6, 2);
		thickStroke(m, 10, 9, 12, 5);
	},
	sad: (m) => {
		thickStroke(m, 3, 10, 5, 6);
		box(m, 5, 5, 6, 2);
		thickStroke(m, 10, 6, 12, 10);
	},
	angry: (m) => {
		thickStroke(m, 2, 3, 7, 7);
		thickStroke(m, 13, 3, 8, 7);
		box(m, 4, 10, 8, 2);
	},
	surprised: (m) => {
		box(m, 7, 2, 3, 8);
		box(m, 7, 11, 3, 3);
	},
	afraid: (m) => {
		thickStroke(m, 4, 2, 11, 5);
		thickStroke(m, 11, 5, 4, 8);
		thickStroke(m, 4, 8, 11, 11);
	},
	curious: (m) => {
		box(m, 5, 2, 6, 2);
		box(m, 10, 3, 2, 3);
		thickStroke(m, 10, 5, 8, 7);
		box(m, 7, 7, 2, 3);
		box(m, 7, 12, 2, 2);
	},
	thinking: (m) => {
		box(m, 2, 9, 3, 3);
		box(m, 6, 9, 3, 3);
		box(m, 10, 9, 3, 3);
	},
	smug: (m) => {
		box(m, 8, 4, 5, 2);
		box(m, 3, 10, 6, 2);
		thickStroke(m, 8, 10, 12, 7);
	},
	embarrassed: (m) => {
		box(m, 2, 7, 4, 4);
		box(m, 10, 7, 4, 4);
		box(m, 6, 11, 4, 2);
	},
	hurt: (m) => {
		thickStroke(m, 3, 3, 12, 11);
		thickStroke(m, 12, 3, 3, 11);
	},
	determined: (m) => {
		thickStroke(m, 8, 2, 3, 8);
		thickStroke(m, 8, 2, 13, 8);
		box(m, 6, 7, 4, 7);
	},
};

/**
 * Grow a mask by one pixel in the eight-neighbour sense. The difference against
 * the original mask is the outline, which is what keeps a white glyph readable
 * against a bright sprite.
 */
const dilate = (mask: Mask): Mask => {
	const at = (x: number, y: number): boolean =>
		x >= 0 && y >= 0 && x < SIZE && y < SIZE
			? mask[y * SIZE + x]!
			: false;
	const out = blankMask();
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			let near = false;
			for (let dy = -1; dy <= 1 && !near; dy++) {
				for (let dx = -1; dx <= 1 && !near; dx++) {
					near = at(x + dx, y + dy);
				}
			}
			out[y * SIZE + x] = near;
		}
	}
	return out;
};

const touchesBorder = (mask: Mask): boolean => {
	for (let i = 0; i < SIZE; i++) {
		if (
			mask[i] ||
			mask[(SIZE - 1) * SIZE + i] ||
			mask[i * SIZE] ||
			mask[i * SIZE + (SIZE - 1)]
		) {
			return true;
		}
	}
	return false;
};

const filled = (mask: Mask): number =>
	mask.reduce((count, on) => (on ? count + 1 : count), 0);

const sheetSize = (): { width: number; height: number } => {
	const claimed = new Set<string>();
	let width = 0;
	let height = 0;
	for (const emotion of EMOTION_IDS) {
		const cell = EMOTION_CELLS[emotion];
		if (cell.srcW !== SIZE || cell.srcH !== SIZE) {
			throw new Error(
				`Emotion "${emotion}" claims a ${cell.srcW}x${cell.srcH} cell; every cell must be ${SIZE}x${SIZE}.`,
			);
		}
		const key = `${cell.srcX},${cell.srcY}`;
		if (claimed.has(key)) {
			throw new Error(
				`Two emotions claim the atlas cell at (${key}); EMOTION_CELLS must be one-to-one or icons draw each other's glyphs.`,
			);
		}
		claimed.add(key);
		width = Math.max(width, cell.srcX + cell.srcW);
		height = Math.max(height, cell.srcY + cell.srcH);
	}
	const expectedWidth = EMOTION_ICON_COLUMNS * SIZE;
	const expectedHeight =
		Math.ceil(EMOTION_IDS.length / EMOTION_ICON_COLUMNS) * SIZE;
	if (width !== expectedWidth || height !== expectedHeight) {
		throw new Error(
			`EMOTION_CELLS spans ${width}x${height}, but ${EMOTION_IDS.length} emotions in ${EMOTION_ICON_COLUMNS} columns must fill ${expectedWidth}x${expectedHeight} exactly.`,
		);
	}
	return { width, height };
};

const blit = (
	sheet: PixelBuffer,
	mask: Mask,
	originX: number,
	originY: number,
): void => {
	const grown = dilate(mask);
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			const index = y * SIZE + x;
			if (!grown[index]) {
				continue;
			}
			const color = mask[index] ? GLYPH : OUTLINE;
			const target = ((originY + y) * sheet.width + originX + x) * 4;
			sheet.data.set(color, target);
		}
	}
};

const paintSheet = (): PixelBuffer => {
	const { width, height } = sheetSize();
	const sheet = blankPixels(width, height);
	for (const emotion of EMOTION_IDS) {
		const mask = blankMask();
		GLYPHS[emotion](mask);
		if (filled(mask) === 0) {
			throw new Error(
				`Emotion "${emotion}" paints no pixels, so its icon would be invisible.`,
			);
		}
		if (touchesBorder(dilate(mask))) {
			throw new Error(
				`Emotion "${emotion}" paints within one pixel of its cell border, so its outline would sit flush against the neighbouring cell and the two icons would read as one.`,
			);
		}
		const cell = EMOTION_CELLS[emotion];
		blit(sheet, mask, cell.srcX, cell.srcY);
	}
	return sheet;
};

const sheet = paintSheet();
const bytes = encodePng(sheet);

const unchanged = (): boolean => {
	try {
		return Buffer.from(readFileSync(OUT_FILE)).equals(
			Buffer.from(bytes),
		);
	} catch {
		return false;
	}
};

if (unchanged()) {
	console.log(`Unchanged ${OUT_FILE}`);
} else {
	writeFileSync(OUT_FILE, bytes);
	console.log(`Generated ${OUT_FILE}`);
}
console.log(
	`  ${sheet.width}x${sheet.height}, ${EMOTION_IDS.length} icons of ${SIZE}x${SIZE} in ${EMOTION_ICON_COLUMNS} columns`,
);
