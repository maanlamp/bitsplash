import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { runCommand } from "../src/editor/sprite/command-router";
import {
	flipImageHorizontal,
	flipImageVertical,
} from "../src/editor/sprite/image-commands";
import {
	flipHorizontal,
	flipVertical,
	rotateCcw,
	rotateCw,
} from "../src/editor/sprite/image-transform";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";
import type { SpriteDocument } from "../src/editor/sprite/sprite-document";

const pixel = (
	buf: PixelBuffer,
	x: number,
	y: number,
): [number, number, number, number] => {
	const i = (y * buf.width + x) * 4;
	return [
		buf.data[i]!,
		buf.data[i + 1]!,
		buf.data[i + 2]!,
		buf.data[i + 3]!,
	];
};

const setPixel = (
	buf: PixelBuffer,
	x: number,
	y: number,
	rgba: [number, number, number, number],
): void => {
	const i = (y * buf.width + x) * 4;
	buf.data[i] = rgba[0];
	buf.data[i + 1] = rgba[1];
	buf.data[i + 2] = rgba[2];
	buf.data[i + 3] = rgba[3];
};

/** A distinct colour per cell so a transform's mapping is unambiguous. */
const ramp = (width: number, height: number): PixelBuffer => {
	const buf = blankPixels(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			setPixel(buf, x, y, [x + 1, y + 1, x * height + y, 255]);
		}
	}
	return buf;
};

describe("flip pixel math", () => {
	test("flipHorizontal mirrors columns", () => {
		const src = ramp(3, 2);
		const out = flipHorizontal(src);
		expect(out.width).toBe(3);
		expect(out.height).toBe(2);
		expect(pixel(out, 0, 0)).toEqual(pixel(src, 2, 0));
		expect(pixel(out, 2, 1)).toEqual(pixel(src, 0, 1));
		expect(pixel(out, 1, 0)).toEqual(pixel(src, 1, 0));
	});

	test("flipVertical mirrors rows", () => {
		const src = ramp(3, 2);
		const out = flipVertical(src);
		expect(pixel(out, 0, 0)).toEqual(pixel(src, 0, 1));
		expect(pixel(out, 2, 1)).toEqual(pixel(src, 2, 0));
	});

	test("flip twice is the identity (its own inverse)", () => {
		const src = ramp(4, 3);
		expect(flipHorizontal(flipHorizontal(src)).data).toEqual(
			src.data,
		);
		expect(flipVertical(flipVertical(src)).data).toEqual(src.data);
	});

	test("inputs are never mutated", () => {
		const src = ramp(3, 3);
		const before = src.data.slice();
		flipHorizontal(src);
		flipVertical(src);
		expect(src.data).toEqual(before);
	});
});

describe("rotate pixel math", () => {
	test("rotateCw swaps dimensions and moves top-left to top-right", () => {
		const src = ramp(3, 2);
		const out = rotateCw(src);
		expect(out.width).toBe(2);
		expect(out.height).toBe(3);
		expect(pixel(out, out.width - 1, 0)).toEqual(pixel(src, 0, 0));
	});

	test("rotateCcw moves top-left to bottom-left", () => {
		const src = ramp(3, 2);
		const out = rotateCcw(src);
		expect(out.width).toBe(2);
		expect(out.height).toBe(3);
		expect(pixel(out, 0, out.height - 1)).toEqual(pixel(src, 0, 0));
	});

	test("four clockwise rotations are the identity", () => {
		const src = ramp(4, 3);
		const out = rotateCw(rotateCw(rotateCw(rotateCw(src))));
		expect(out.width).toBe(4);
		expect(out.height).toBe(3);
		expect(out.data).toEqual(src.data);
	});

	test("rotateCcw is the exact inverse of rotateCw", () => {
		const src = ramp(4, 3);
		expect(rotateCcw(rotateCw(src)).data).toEqual(src.data);
		expect(rotateCw(rotateCcw(src)).data).toEqual(src.data);
	});
});

/**
 * A headless stand-in for {@link SpriteDocument} whose flip ops run the same
 * pure transforms on a plain pixel buffer, so the command routing and undo
 * inverse can be asserted without a canvas.
 */
class FakeDoc {
	buffer: PixelBuffer;
	constructor(width: number, height: number) {
		this.buffer = ramp(width, height);
	}
	flipHorizontal(): void {
		this.buffer = flipHorizontal(this.buffer);
	}
	flipVertical(): void {
		this.buffer = flipVertical(this.buffer);
	}
	commitPendingFloatingEdit(): void {}
	captureSelection(): null {
		return null;
	}
	restoreSelection(): void {}
}

const asDoc = (fake: FakeDoc): SpriteDocument =>
	fake as unknown as SpriteDocument;

describe("flip commands", () => {
	test("flip records one undo entry and undoes back to the original", async () => {
		const fake = new FakeDoc(3, 2);
		const history = new History();
		const original = fake.buffer.data.slice();

		flipImageHorizontal(asDoc(fake), history);
		expect(history.canUndo).toBe(true);
		expect(fake.buffer.data).not.toEqual(original);

		history.undo();
		await history.settle();
		expect(fake.buffer.data).toEqual(original);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(true);
	});

	test("redo re-applies the same flip", async () => {
		const fake = new FakeDoc(4, 3);
		const history = new History();
		flipImageVertical(asDoc(fake), history);
		const flipped = fake.buffer.data.slice();

		history.undo();
		await history.settle();
		history.redo();
		await history.settle();
		expect(fake.buffer.data).toEqual(flipped);
	});

	test("routing through runCommand directly matches the helper", () => {
		const fake = new FakeDoc(3, 3);
		const history = new History();
		runCommand(asDoc(fake), history, {
			redo: () => fake.flipHorizontal(),
			undo: () => fake.flipHorizontal(),
		});
		expect(history.canUndo).toBe(true);
	});
});
