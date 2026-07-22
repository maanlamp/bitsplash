import { describe, expect, test } from "bun:test";
import {
	blankPixels,
	type PixelBuffer,
} from "../src/editor/sprite/pixel-buffer";
import {
	commitStrokeBuffer,
	stampStrokePixel,
} from "../src/editor/sprite/stroke-buffer";
import { BrushTool } from "../src/editor/sprite/brush-tool";
import { History } from "../src/editor/history";
import type {
	StrokeSnapshot,
	SpriteDocument,
} from "../src/editor/sprite/sprite-document";
import type { ToolContext } from "../src/editor/sprite/tool-strategy";

const W = 3;
const H = 3;

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

const fill = (
	rgba: [number, number, number, number],
): PixelBuffer => {
	const buf = blankPixels(W, H);
	for (let i = 0; i < buf.data.length; i += 4) {
		buf.data[i] = rgba[0];
		buf.data[i + 1] = rgba[1];
		buf.data[i + 2] = rgba[2];
		buf.data[i + 3] = rgba[3];
	}
	return buf;
};

describe("stroke buffer math", () => {
	test("stampStrokePixel writes full opacity and ignores out-of-bounds", () => {
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 1, 1, 10, 20, 30);
		expect(pixel(buf, 1, 1)).toEqual([10, 20, 30, 255]);
		stampStrokePixel(buf, -1, 0, 1, 2, 3);
		stampStrokePixel(buf, 0, H, 1, 2, 3);
		expect(pixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
	});

	test("re-stamping a covered cell stays full opacity (idempotent)", () => {
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 0, 0, 200, 100, 50);
		stampStrokePixel(buf, 0, 0, 200, 100, 50);
		expect(pixel(buf, 0, 0)).toEqual([200, 100, 50, 255]);
	});

	test("opaque paint reproduces the colour byte-for-byte over empty base", () => {
		const base = blankPixels(W, H);
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 1, 1, 12, 34, 56);
		const out = commitStrokeBuffer(base, buf, "paint", 1);
		expect(pixel(out, 1, 1)).toEqual([12, 34, 56, 255]);
		expect(pixel(out, 0, 0)).toEqual([0, 0, 0, 0]);
	});

	test("semi-transparent stroke lands uniform — overlaps do not compound", () => {
		const base = blankPixels(W, H);
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 0, 0, 255, 0, 0);
		stampStrokePixel(buf, 1, 0, 255, 0, 0);
		stampStrokePixel(buf, 1, 0, 255, 0, 0); // overlap of the same stroke
		const out = commitStrokeBuffer(base, buf, "paint", 0.5);
		const expectedAlpha = Math.round(0.5 * 255); // 128, never 0.75*255
		expect(pixel(out, 0, 0)[3]).toBe(expectedAlpha);
		expect(pixel(out, 1, 0)[3]).toBe(expectedAlpha);
		expect(pixel(out, 0, 0)).toEqual(pixel(out, 1, 0));
	});

	test("paint composites over an opaque base at the target opacity", () => {
		const base = fill([255, 255, 255, 255]);
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 2, 2, 0, 0, 0);
		const out = commitStrokeBuffer(base, buf, "paint", 0.5);
		expect(pixel(out, 2, 2)).toEqual([128, 128, 128, 255]);
		expect(pixel(out, 0, 0)).toEqual([255, 255, 255, 255]);
	});

	test("erase clears covered pixels and preserves the rest", () => {
		const base = fill([9, 8, 7, 255]);
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 0, 0, 0, 0, 0);
		const out = commitStrokeBuffer(base, buf, "erase", 1);
		expect(pixel(out, 0, 0)[3]).toBe(0);
		expect(pixel(out, 1, 1)).toEqual([9, 8, 7, 255]);
	});

	test("erase at partial opacity scales the base alpha down", () => {
		const base = fill([9, 8, 7, 255]);
		const buf = blankPixels(W, H);
		stampStrokePixel(buf, 0, 0, 0, 0, 0);
		const out = commitStrokeBuffer(base, buf, "erase", 0.5);
		expect(pixel(out, 0, 0)).toEqual([9, 8, 7, 128]);
	});
});

/**
 * A headless stand-in for the DOM {@link SpriteDocument} that mirrors its stroke
 * lifecycle on a plain pixel array using the same pure buffer functions, so the
 * tool → document → history contract can be asserted without a canvas.
 */
class FakeDoc {
	readonly width = W;
	readonly height = H;
	layer = blankPixels(W, H);
	private buffer: PixelBuffer | null = null;
	private mode: "paint" | "erase" | null = null;
	constructor(
		private color: [number, number, number] = [255, 0, 0],
		private opacity = 0.5,
	) {}

	snapshot(): StrokeSnapshot {
		return {
			layerId: "a",
			frameIndex: 0,
			data: {
				data: this.layer.data.slice(),
				width: W,
				height: H,
			},
		};
	}

	restore(snap: StrokeSnapshot): void {
		this.layer = {
			width: W,
			height: H,
			data: (snap.data.data as Uint8ClampedArray).slice(),
		};
	}

	beginStroke(): void {
		this.buffer = blankPixels(W, H);
		this.mode = null;
	}

	setPixel(x: number, y: number): void {
		this.mode = "paint";
		stampStrokePixel(this.buffer!, x, y, ...this.color);
	}

	commitStroke(): void {
		if (this.buffer && this.mode) {
			this.layer = commitStrokeBuffer(
				this.layer,
				this.buffer,
				this.mode,
				this.opacity,
			);
		}
		this.buffer = null;
		this.mode = null;
	}

	cancelStroke(): void {
		this.buffer = null;
		this.mode = null;
	}

	refreshStrokePreview(): void {}

	setStrokeOpacityScale(): void {}

	commitPendingFloatingEdit(): void {}

	captureSelection(): null {
		return null;
	}

	restoreSelection(): void {}
}

const ctxFor = (
	doc: FakeDoc,
	history: History,
	x: number,
	y: number,
): ToolContext =>
	({
		doc: doc as unknown as SpriteDocument,
		state: {
			modifiers: {
				ink: "normal",
				symmetry: "off",
				pixelPerfect: false,
				stabilizer: 0,
			},
			brushShape: "round",
			brushSize: 1,
		},
		history,
		x,
		y,
		overImage: true,
		button: 0,
		pressure: 0,
		capture: () => {},
		paint: (px: number, py: number) => doc.setPixel(px, py),
		erase: () => {},
		sample: () => null,
	}) as unknown as ToolContext;

describe("stroke buffer lifecycle", () => {
	test("one stroke pushes exactly one history entry; undo restores pixels", async () => {
		const doc = new FakeDoc();
		const history = new History();
		const brush = new BrushTool();
		const session = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		const before = doc.layer.data.slice();
		brush.onDown(ctxFor(doc, history, 0, 0), session);
		brush.onMove(ctxFor(doc, history, 2, 0), session);
		brush.onUp(ctxFor(doc, history, 2, 0), session);

		expect(history.canUndo).toBe(true);
		// Painted pixels landed uniform at the target opacity.
		expect(pixel(doc.layer, 0, 0)[3]).toBe(128);
		expect(pixel(doc.layer, 2, 0)[3]).toBe(128);

		history.undo();
		await history.settle();
		expect(doc.layer.data).toEqual(before);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(true);
	});

	test("cancel leaves the layer untouched and records nothing", () => {
		const doc = new FakeDoc();
		const history = new History();
		const brush = new BrushTool();
		const session = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		const before = doc.layer.data.slice();
		brush.onDown(ctxFor(doc, history, 1, 1), session);
		brush.onCancel(ctxFor(doc, history, 1, 1), session);

		expect(doc.layer.data).toEqual(before);
		expect(history.canUndo).toBe(false);
	});
});
