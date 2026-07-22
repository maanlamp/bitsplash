import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";
import {
	type DocumentSnapshot,
	serializeBsprite,
} from "../src/editor/sprite/bsprite-writer";
import { decodePng, encodePng } from "../src/editor/sprite/png-codec";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";

const WIDTH = 4;
const HEIGHT = 4;

const paint = (
	pixels: ReadonlyArray<
		readonly [number, number, [number, number, number, number]]
	>,
): PixelBuffer => {
	const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
	for (const [x, y, [r, g, b, a]] of pixels) {
		const i = (y * WIDTH + x) * 4;
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
		data[i + 3] = a;
	}
	return { width: WIDTH, height: HEIGHT, data };
};

const RED: [number, number, number, number] = [255, 0, 0, 255];

const baseCel = paint([
	[1, 1, RED],
	[2, 1, RED],
	[1, 2, RED],
	[2, 2, RED],
]);
const topCel = paint([[1, 1, [100, 0, 0, 255]]]);

const snapshot = (
	tags: DocumentSnapshot["tags"],
): DocumentSnapshot => ({
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
			opacity: 1,
			visible: true,
			blend: "subtract",
		},
	],
	frames: [{ duration: 120 }],
	cels: [
		{ layerId: "base", frameIndex: 0, pixels: baseCel },
		{ layerId: "top", frameIndex: 0, pixels: topCel },
	],
	tags,
	tileset: { columns: 3 },
	slice: { left: 1, right: 1, top: 1, bottom: 1 },
});

const IDLE = [{ name: "idle", from: 0, to: 0, loop: true }] as const;

const px = (buf: PixelBuffer, x: number, y: number): number[] => {
	const i = (y * buf.width + x) * 4;
	return [
		buf.data[i]!,
		buf.data[i + 1]!,
		buf.data[i + 2]!,
		buf.data[i + 3]!,
	];
};

describe("serializeBsprite round-trip", () => {
	const bytes = serializeBsprite(snapshot(IDLE));
	const entries = unzipSync(bytes);
	const manifest = readBspriteManifest(bytes);

	test("manifest round-trips through the engine facade", () => {
		expect(manifest.version).toBe(1);
		expect(manifest.width).toBe(4);
		expect(manifest.height).toBe(4);
		expect(manifest.layers.map((l) => l.id)).toEqual(["base", "top"]);
		expect(manifest.layers[1]?.blend).toBe("subtract");
		expect(manifest.frames).toEqual([{ duration: 120 }]);
		expect(manifest.tags).toEqual([
			{ name: "idle", from: 0, to: 0, loop: true },
		]);
		expect(manifest.tileset).toEqual({ columns: 3 });
		expect(manifest.slice).toEqual({
			left: 1,
			right: 1,
			top: 1,
			bottom: 1,
		});
	});

	test("cels are listed sparsely and backed by STORED PNG entries", () => {
		expect(manifest.cels).toEqual([
			{ layer: "base", frame: 0 },
			{ layer: "top", frame: 0 },
		]);
		expect(entries["layers/base/0.png"]).toBeDefined();
		expect(entries["layers/top/0.png"]).toBeDefined();
		expect(entries["bakes/0.png"]).toBeDefined();
	});

	test("baked frame pixels match the expected composite (incl. subtract)", () => {
		const bake = decodePng(entries["bakes/0.png"]!);
		// (1,1): red backdrop, subtract 100 → 255 - 100 = 155
		expect(px(bake, 1, 1)).toEqual([155, 0, 0, 255]);
		// remaining block pixels: plain red (top layer transparent there)
		expect(px(bake, 2, 1)).toEqual([255, 0, 0, 255]);
		expect(px(bake, 1, 2)).toEqual([255, 0, 0, 255]);
		expect(px(bake, 2, 2)).toEqual([255, 0, 0, 255]);
		// outside the block: transparent
		expect(px(bake, 0, 0)).toEqual([0, 0, 0, 0]);
		expect(px(bake, 3, 3)).toEqual([0, 0, 0, 0]);
	});

	test("cel PNG bytes decode back to the authored pixels", () => {
		const base = decodePng(entries["layers/base/0.png"]!);
		expect(px(base, 1, 1)).toEqual([255, 0, 0, 255]);
		expect(px(base, 0, 0)).toEqual([0, 0, 0, 0]);
	});

	test("content rect is the union of baked-frame alpha bounds", () => {
		expect(manifest.contentRects?.idle).toEqual({
			x: 1,
			y: 1,
			width: 2,
			height: 2,
		});
	});

	test("a fully-transparent tag gets no content rect", () => {
		const empty = serializeBsprite({
			...snapshot(IDLE),
			cels: [],
		});
		expect(readBspriteManifest(empty).contentRects).toBeUndefined();
	});
});

describe("dirty-frame byte stability", () => {
	test("a metadata-only re-save reuses cel/bake bytes verbatim, manifest differs", () => {
		const first = serializeBsprite(snapshot(IDLE));
		const before = unzipSync(first);

		let encodeCalls = 0;
		const spyEncode = (image: PixelBuffer): Uint8Array => {
			encodeCalls++;
			return encodePng(image);
		};

		// Same pixels, but a new tag added — a metadata-only edit.
		const retagged = serializeBsprite(
			snapshot([
				{ name: "idle", from: 0, to: 0, loop: true },
				{ name: "hold", from: 0, to: 0, loop: false },
			]),
			{
				previous: before,
				isCelDirty: () => false,
				isBakeDirty: () => false,
				encode: spyEncode,
			},
		);
		const after = unzipSync(retagged);

		expect(encodeCalls).toBe(0);
		for (const path of [
			"layers/base/0.png",
			"layers/top/0.png",
			"bakes/0.png",
		]) {
			expect(Array.from(after[path]!)).toEqual(
				Array.from(before[path]!),
			);
		}
		expect(Array.from(after["manifest.json"]!)).not.toEqual(
			Array.from(before["manifest.json"]!),
		);
	});

	test("a dirty cel is re-encoded rather than copied", () => {
		const first = serializeBsprite(snapshot(IDLE));
		const before = unzipSync(first);

		let encodeCalls = 0;
		const spyEncode = (image: PixelBuffer): Uint8Array => {
			encodeCalls++;
			return encodePng(image);
		};
		serializeBsprite(snapshot(IDLE), {
			previous: before,
			isCelDirty: (layerId) => layerId === "top",
			isBakeDirty: () => true,
			encode: spyEncode,
		});
		// top cel + the (single) bake are dirty → two encodes; base cel copied.
		expect(encodeCalls).toBe(2);
	});
});
