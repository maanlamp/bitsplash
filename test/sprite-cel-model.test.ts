import { describe, expect, test } from "bun:test";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";
import {
	CelStore,
	type CelStoreDescription,
} from "../src/editor/sprite/cel-store";
import { serializeBsprite } from "../src/editor/sprite/bsprite-writer";
import { History } from "../src/editor/history";
import {
	addFrame,
	deleteFrame,
	duplicateFrame,
	moveFrame,
	setFrameDuration,
} from "../src/editor/sprite/frame-commands";
import {
	createTag,
	deleteTag,
	renameTag,
	setTagLoop,
	setTagRange,
} from "../src/editor/sprite/tag-commands";
import {
	blankPixels,
	type PixelBuffer,
} from "../src/editor/sprite/pixel-buffer";
import type { SpriteDocument } from "../src/editor/sprite/sprite-document";

const asDoc = (store: CelStore): SpriteDocument => {
	const target = store as unknown as {
		commitPendingFloatingEdit: () => void;
		captureSelection: () => null;
		restoreSelection: () => void;
	};
	target.commitPendingFloatingEdit = () => {};
	target.captureSelection = () => null;
	target.restoreSelection = () => {};
	return store as unknown as SpriteDocument;
};

const buf = (
	width: number,
	height: number,
	pixels: ReadonlyArray<
		readonly [number, number, [number, number, number, number]]
	>,
): PixelBuffer => {
	const b = blankPixels(width, height);
	for (const [x, y, [r, g, bl, a]] of pixels) {
		const i = (y * width + x) * 4;
		b.data[i] = r;
		b.data[i + 1] = g;
		b.data[i + 2] = bl;
		b.data[i + 3] = a;
	}
	return b;
};

const OPAQUE: [number, number, number, number] = [10, 20, 30, 255];

const twoFrameDoc = (): CelStore => {
	const desc: CelStoreDescription = {
		width: 4,
		height: 4,
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
				blend: "source-over",
			},
		],
		frames: [{ duration: 100 }, { duration: 150 }],
		cels: [
			{
				layerId: "base",
				frameIndex: 0,
				pixels: buf(4, 4, [[1, 1, OPAQUE]]),
			},
			{
				layerId: "base",
				frameIndex: 1,
				pixels: buf(4, 4, [[2, 2, OPAQUE]]),
			},
			{
				layerId: "top",
				frameIndex: 0,
				pixels: buf(4, 4, [[0, 0, OPAQUE]]),
			},
		],
		tags: [{ name: "idle", from: 0, to: 1, loop: true }],
	};
	return CelStore.fromDescription(desc);
};

describe("cels model — active frame + transforms", () => {
	test("the active frame selects that frame's cels", () => {
		const store = twoFrameDoc();
		expect(store.activeFrameIndex).toBe(0);
		expect(store.getCel("base", 0)!.data[(1 * 4 + 1) * 4 + 3]).toBe(
			255,
		);
		store.setActiveFrame(1);
		expect(store.snapshot().frameIndex).toBe(1);
		// The active cel is frame 1's base cel (pixel at 2,2), not frame 0's.
		expect(store.snapshot().data.data[(2 * 4 + 2) * 4 + 3]).toBe(255);
		expect(store.snapshot().data.data[(1 * 4 + 1) * 4 + 3]).toBe(0);
	});

	test("flip horizontal flips every frame's cels and is its own inverse", () => {
		const store = twoFrameDoc();
		const f0 = store.getCel("base", 0)!.data.slice();
		const f1 = store.getCel("base", 1)!.data.slice();
		store.flipHorizontal();
		// pixel (1,1) → (2,1) on a width-4 image.
		expect(store.getCel("base", 0)!.data[(1 * 4 + 2) * 4 + 3]).toBe(
			255,
		);
		// frame 1's cel also moved.
		expect(store.getCel("base", 1)!.data[(2 * 4 + 1) * 4 + 3]).toBe(
			255,
		);
		store.flipHorizontal();
		expect(store.getCel("base", 0)!.data).toEqual(f0);
		expect(store.getCel("base", 1)!.data).toEqual(f1);
	});

	test("rotate CW then CCW is the identity with dimensions restored", () => {
		const desc: CelStoreDescription = {
			width: 3,
			height: 2,
			layers: [
				{
					id: "l",
					name: "L",
					opacity: 1,
					visible: true,
					blend: "source-over",
				},
			],
			frames: [{ duration: 100 }],
			cels: [
				{
					layerId: "l",
					frameIndex: 0,
					pixels: buf(3, 2, [[2, 0, OPAQUE]]),
				},
			],
			tags: [],
		};
		const store = CelStore.fromDescription(desc);
		const before = store.getCel("l", 0)!.data.slice();

		store.rotateCw();
		expect(store.width).toBe(2);
		expect(store.height).toBe(3);

		store.rotateCcw();
		expect(store.width).toBe(3);
		expect(store.height).toBe(2);
		expect(store.getCel("l", 0)!.data).toEqual(before);
	});
});

describe("frame commands — real inverses", () => {
	test("addFrame inserts after active; undo removes it", async () => {
		const store = twoFrameDoc();
		const doc = asDoc(store);
		const history = new History();
		addFrame(doc, history, 0);
		expect(store.frames.length).toBe(3);
		history.undo();
		await history.settle();
		expect(store.frames.length).toBe(2);
	});

	test("deleteFrame restores duration + per-layer cels + tags on undo", async () => {
		const store = twoFrameDoc();
		const doc = asDoc(store);
		const history = new History();
		const base1 = store.getCel("base", 1)!.data.slice();

		deleteFrame(doc, history, 1);
		expect(store.frames.length).toBe(1);
		expect(store.getCel("base", 1)).toBeNull();
		// The tag range clamped into the shorter timeline.
		expect(store.tags[0]!.to).toBe(0);

		history.undo();
		await history.settle();
		expect(store.frames.length).toBe(2);
		expect(store.frames[1]!.duration).toBe(150);
		expect(store.getCel("base", 1)!.data).toEqual(base1);
		expect(store.tags[0]!.to).toBe(1);
	});

	test("deleting the last remaining frame is refused", () => {
		const desc: CelStoreDescription = {
			width: 2,
			height: 2,
			layers: [
				{
					id: "l",
					name: "L",
					opacity: 1,
					visible: true,
					blend: "source-over",
				},
			],
			frames: [{ duration: 100 }],
			cels: [],
			tags: [],
		};
		const store = CelStore.fromDescription(desc);
		const history = new History();
		deleteFrame(asDoc(store), history, 0);
		expect(store.frames.length).toBe(1);
		expect(history.canUndo).toBe(false);
	});

	test("duplicateFrame copies cels; undo removes the copy", async () => {
		const store = twoFrameDoc();
		const doc = asDoc(store);
		const history = new History();
		duplicateFrame(doc, history, 0);
		expect(store.frames.length).toBe(3);
		// The duplicate (new frame 1) carries frame 0's base + top cels.
		expect(store.getCel("base", 1)!.data[(1 * 4 + 1) * 4 + 3]).toBe(
			255,
		);
		expect(store.getCel("top", 1)!.data[0 + 3]).toBe(255);
		history.undo();
		await history.settle();
		expect(store.frames.length).toBe(2);
		// The original frame 1 (base pixel at 2,2) is back in place.
		expect(store.getCel("base", 1)!.data[(2 * 4 + 2) * 4 + 3]).toBe(
			255,
		);
	});

	test("moveFrame reorders and undo restores the order", async () => {
		const store = twoFrameDoc();
		const doc = asDoc(store);
		const history = new History();
		moveFrame(doc, history, 0, 1);
		// Frame 0's base cel (pixel 1,1) is now at index 1.
		expect(store.getCel("base", 1)!.data[(1 * 4 + 1) * 4 + 3]).toBe(
			255,
		);
		history.undo();
		await history.settle();
		expect(store.getCel("base", 0)!.data[(1 * 4 + 1) * 4 + 3]).toBe(
			255,
		);
	});

	test("setFrameDuration undo/redo restores prior duration", async () => {
		const store = twoFrameDoc();
		const doc = asDoc(store);
		const history = new History();
		setFrameDuration(doc, history, 0, 250);
		expect(store.frames[0]!.duration).toBe(250);
		history.undo();
		await history.settle();
		expect(store.frames[0]!.duration).toBe(100);
		history.redo();
		await history.settle();
		expect(store.frames[0]!.duration).toBe(250);
	});
});

describe("tag commands — real inverses", () => {
	test("create / rename / range / loop / delete undo cleanly", async () => {
		const store = twoFrameDoc();
		const doc = asDoc(store);
		const history = new History();

		createTag(doc, history, {
			name: "run",
			from: 0,
			to: 1,
			loop: false,
		});
		expect(store.tags.map((t) => t.name)).toEqual(["idle", "run"]);

		renameTag(doc, history, 1, "walk");
		expect(store.tags[1]!.name).toBe("walk");

		setTagRange(doc, history, 1, 1, 1);
		expect([store.tags[1]!.from, store.tags[1]!.to]).toEqual([1, 1]);

		setTagLoop(doc, history, 1, true);
		expect(store.tags[1]!.loop).toBe(true);

		deleteTag(doc, history, 1);
		expect(store.tags.map((t) => t.name)).toEqual(["idle"]);

		// Undo delete, loop, range, rename, create — back to just "idle".
		history.undo();
		await history.settle();
		expect(store.tags[1]!.name).toBe("walk");
		history.undo();
		await history.settle();
		expect(store.tags[1]!.loop).toBe(false);
		history.undo();
		await history.settle();
		expect([store.tags[1]!.from, store.tags[1]!.to]).toEqual([0, 1]);
		history.undo();
		await history.settle();
		expect(store.tags[1]!.name).toBe("run");
		history.undo();
		await history.settle();
		expect(store.tags.map((t) => t.name)).toEqual(["idle"]);
	});
});

describe("multi-frame writer → facade round-trip", () => {
	test("a 2-frame, 2-layer, 1-tag document serializes and reads back", () => {
		const store = twoFrameDoc();
		const bytes = serializeBsprite(store.toSnapshot());
		const manifest = readBspriteManifest(bytes);

		expect(manifest.width).toBe(4);
		expect(manifest.height).toBe(4);
		expect(manifest.frames).toEqual([
			{ duration: 100 },
			{ duration: 150 },
		]);
		expect(manifest.layers.map((l) => l.id)).toEqual(["base", "top"]);
		expect(manifest.tags).toEqual([
			{ name: "idle", from: 0, to: 1, loop: true },
		]);
		// Sparse cels: base on both frames, top only on frame 0 → 3 cels.
		expect(manifest.cels).toEqual([
			{ layer: "base", frame: 0 },
			{ layer: "top", frame: 0 },
			{ layer: "base", frame: 1 },
		]);
		// Content rect is the union of both frames' baked alpha bounds:
		// frame 0 covers (0,0) and (1,1); frame 1 covers (2,2) → x0..2, y0..2.
		expect(manifest.contentRects?.idle).toEqual({
			x: 0,
			y: 0,
			width: 3,
			height: 3,
		});
	});
});
