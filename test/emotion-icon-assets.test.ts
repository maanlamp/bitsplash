import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import AssetManager from "../src/engine/assets";
import { decodePng } from "../src/editor/sprite/png-codec";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";
import {
	EMOTION_IDS,
	type EmotionId,
} from "../src/game/character/emotion-ids";
import {
	EMOTION_CELLS,
	EMOTION_ICON_COLUMNS,
	EMOTION_ICON_SIZE,
} from "../src/game/reaction/emotion-icon-atlas";

const SHEET = "/src/game/content/assets/emotions.icons.png";

const bytes = (): Uint8Array =>
	new Uint8Array(readFileSync(`${import.meta.dir}/..${SHEET}`));

/** The committed atlas decoded straight off disk, for per-pixel assertions. */
const pixels = (): PixelBuffer => decodePng(bytes());

/**
 * The committed atlas as the game gets it: through a real {@link AssetManager},
 * with only the DOM-bound decode step replaced (the default loader needs an
 * `Image`). Asserting against the shipped bytes is the point — a generator that
 * lays the sheet out differently, or a hand-edit, fails here.
 */
const loadSheet = async (): Promise<{
	width: number;
	height: number;
}> => {
	const decoded = pixels();
	const assetManager = new AssetManager(
		async () =>
			({
				width: decoded.width,
				height: decoded.height,
			}) as unknown as HTMLImageElement,
	);
	expect(assetManager.getImage(SHEET)).toBeUndefined();
	for (let attempt = 0; attempt < 10; attempt++) {
		const image = assetManager.getImage(SHEET);
		if (image) {
			return { width: image.width, height: image.height };
		}
		await Promise.resolve();
	}
	throw new Error(`${SHEET} never finished loading.`);
};

const cellIsPainted = (
	image: PixelBuffer,
	emotion: EmotionId,
): boolean => {
	const cell = EMOTION_CELLS[emotion];
	for (let y = 0; y < cell.srcH; y++) {
		for (let x = 0; x < cell.srcW; x++) {
			const index =
				((cell.srcY + y) * image.width + cell.srcX + x) * 4 + 3;
			if (image.data[index]! > 0) {
				return true;
			}
		}
	}
	return false;
};

describe("emotions.icons.png", () => {
	test("is exactly as large as the cell table claims", async () => {
		const image = await loadSheet();

		expect(image.width).toBe(
			EMOTION_ICON_COLUMNS * EMOTION_ICON_SIZE,
		);
		expect(image.height).toBe(
			Math.ceil(EMOTION_IDS.length / EMOTION_ICON_COLUMNS) *
				EMOTION_ICON_SIZE,
		);
	});

	test("has one distinct in-bounds cell per emotion", async () => {
		const image = await loadSheet();
		const claimed = new Set<string>();

		for (const emotion of EMOTION_IDS) {
			const cell = EMOTION_CELLS[emotion];
			expect(cell.srcW).toBe(EMOTION_ICON_SIZE);
			expect(cell.srcH).toBe(EMOTION_ICON_SIZE);
			expect(cell.srcX + cell.srcW).toBeLessThanOrEqual(image.width);
			expect(cell.srcY + cell.srcH).toBeLessThanOrEqual(image.height);
			claimed.add(`${cell.srcX},${cell.srcY}`);
		}

		expect(claimed.size).toBe(EMOTION_IDS.length);
	});

	test("paints a glyph in every cell, so no emotion draws blank", () => {
		const image = pixels();

		const blank = EMOTION_IDS.filter(
			(emotion) => !cellIsPainted(image, emotion),
		);

		expect(blank).toEqual([]);
	});
});
