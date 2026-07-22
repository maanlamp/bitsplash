import { describe, expect, test } from "bun:test";
import {
	describeArchive,
	unpackBsprite,
} from "../src/editor/sprite/bsprite-loader";
import {
	type DocumentSnapshot,
	serializeBsprite,
} from "../src/editor/sprite/bsprite-writer";
import { CelStore } from "../src/editor/sprite/cel-store";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";

const WIDTH = 4;
const HEIGHT = 4;

const buf = (
	pixels: ReadonlyArray<
		readonly [number, number, [number, number, number, number]]
	>,
): PixelBuffer => {
	const b = blankPixels(WIDTH, HEIGHT);
	for (const [x, y, [r, g, bl, a]] of pixels) {
		const i = (y * WIDTH + x) * 4;
		b.data[i] = r;
		b.data[i + 1] = g;
		b.data[i + 2] = bl;
		b.data[i + 3] = a;
	}
	return b;
};

const px = (b: PixelBuffer, x: number, y: number): number[] => {
	const i = (y * b.width + x) * 4;
	return [b.data[i]!, b.data[i + 1]!, b.data[i + 2]!, b.data[i + 3]!];
};

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];

const baseF0 = buf([[1, 1, RED]]);
const baseF1 = buf([[2, 2, BLUE]]);
const topF0 = buf([[0, 0, GREEN]]);

const authored = (): DocumentSnapshot => ({
	width: WIDTH,
	height: HEIGHT,
	layers: [
		{
			id: "base",
			name: "Base",
			opacity: 1,
			visible: true,
			blend: "source-over",
		},
		{
			id: "top",
			name: "Top",
			opacity: 0.5,
			visible: true,
			blend: "source-over",
		},
	],
	frames: [{ duration: 100 }, { duration: 150 }],
	cels: [
		{ layerId: "base", frameIndex: 0, pixels: baseF0 },
		{ layerId: "top", frameIndex: 0, pixels: topF0 },
		{ layerId: "base", frameIndex: 1, pixels: baseF1 },
	],
	tags: [{ name: "idle", from: 0, to: 1, loop: true }],
	attachments: { grip: { "0": { x: 1, y: 1 }, "1": { x: 2, y: 2 } } },
	slice: { left: 1, right: 1, top: 1, bottom: 1 },
	tileset: { columns: 3 },
});

describe("bsprite load — describeArchive decodes cels + metadata", () => {
	const bytes = serializeBsprite(authored());
	const desc = describeArchive(unpackBsprite(bytes));

	test("canvas size, layers, frames, tags survive the round-trip", () => {
		expect(desc.width).toBe(WIDTH);
		expect(desc.height).toBe(HEIGHT);
		expect(desc.layers.map((l) => l.id)).toEqual(["base", "top"]);
		expect(desc.layers[1]?.opacity).toBe(0.5);
		expect(desc.layers[1]?.blend).toBe("source-over");
		expect(desc.frames).toEqual([
			{ duration: 100 },
			{ duration: 150 },
		]);
		expect(desc.tags).toEqual([
			{ name: "idle", from: 0, to: 1, loop: true },
		]);
	});

	test("metadata blocks (attachments, slice, tileset) survive", () => {
		expect(desc.attachments).toEqual({
			grip: { "0": { x: 1, y: 1 }, "1": { x: 2, y: 2 } },
		});
		expect(desc.slice).toEqual({
			left: 1,
			right: 1,
			top: 1,
			bottom: 1,
		});
		expect(desc.tileset).toEqual({ columns: 3 });
	});

	test("cels are sparse and decode back to the authored pixels", () => {
		expect(desc.cels.map((c) => [c.layerId, c.frameIndex])).toEqual([
			["base", 0],
			["top", 0],
			["base", 1],
		]);
		const byKey = new Map(
			desc.cels.map((c) => [
				`${c.layerId}#${c.frameIndex}`,
				c.pixels,
			]),
		);
		expect(px(byKey.get("base#0")!, 1, 1)).toEqual(RED);
		expect(px(byKey.get("base#0")!, 0, 0)).toEqual([0, 0, 0, 0]);
		expect(px(byKey.get("top#0")!, 0, 0)).toEqual(GREEN);
		expect(px(byKey.get("base#1")!, 2, 2)).toEqual(BLUE);
	});
});

describe("bsprite load → re-save round-trip through the cel store", () => {
	test("a loaded description re-serializes to an equivalent manifest", () => {
		const first = serializeBsprite(authored());
		const desc = describeArchive(unpackBsprite(first));

		// The load path a document takes (minus the DOM canvas the model wraps).
		const store = CelStore.fromDescription(desc);
		const second = serializeBsprite(store.toSnapshot());
		const manifest = readBspriteManifest(second);

		expect(manifest.width).toBe(WIDTH);
		expect(manifest.height).toBe(HEIGHT);
		expect(manifest.frames).toEqual([
			{ duration: 100 },
			{ duration: 150 },
		]);
		expect(manifest.layers.map((l) => l.id)).toEqual(["base", "top"]);
		expect(manifest.tags).toEqual([
			{ name: "idle", from: 0, to: 1, loop: true },
		]);
		expect(manifest.cels).toEqual([
			{ layer: "base", frame: 0 },
			{ layer: "top", frame: 0 },
			{ layer: "base", frame: 1 },
		]);
		expect(manifest.tileset).toEqual({ columns: 3 });
		expect(manifest.slice).toEqual({
			left: 1,
			right: 1,
			top: 1,
			bottom: 1,
		});
		expect(manifest.attachments).toEqual({
			grip: { "0": { x: 1, y: 1 }, "1": { x: 2, y: 2 } },
		});
	});

	test("cel PNG bytes are byte-identical across the load→save round-trip", () => {
		const first = serializeBsprite(authored());
		const before = unpackBsprite(first);
		const desc = describeArchive(before);
		const store = CelStore.fromDescription(desc);
		const after = unpackBsprite(serializeBsprite(store.toSnapshot()));

		for (const path of [
			"layers/base/0.png",
			"layers/top/0.png",
			"layers/base/1.png",
			"bakes/0.png",
			"bakes/1.png",
		]) {
			expect(Array.from(after[path]!)).toEqual(
				Array.from(before[path]!),
			);
		}
	});
});
