import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { moveCel } from "../src/editor/sprite/cel-commands";
import { CelStore } from "../src/editor/sprite/cel-store";
import {
	blankPixels,
	type PixelBuffer,
} from "../src/editor/sprite/pixel-buffer";
import type { SpriteDocument } from "../src/editor/sprite/sprite-document";

/** Attach the inert choke-point hooks so a raw store stands in for the document. */
const asDoc = (store: CelStore): SpriteDocument => {
	const target = store as unknown as {
		commitPendingFloatingEdit: () => void;
		captureSelection: () => null;
		restoreSelection: () => void;
	};
	target.commitPendingFloatingEdit = () => {};
	target.captureSelection = () => null;
	target.restoreSelection = () => {};
	// getCel/setCel/moveCel exist on the store with the same signatures the
	// command calls, so the real artifact is exercised without the DOM wrapper.
	return store as unknown as SpriteDocument;
};

const painted = (index: number, value: number): PixelBuffer => {
	const buf = blankPixels(2, 2);
	buf.data[index] = value;
	buf.data[index + 3] = 255;
	return buf;
};

const twoLayerStore = (): CelStore => {
	const store = new CelStore(2, 2);
	const a = store.activeLayerId;
	store.insertLayer(
		{
			id: "b",
			name: "B",
			blend: "source-over",
			opacity: 1,
			visible: true,
			cels: [],
		},
		1,
	);
	store.putCel(a, 0, painted(0, 200));
	return store;
};

describe("moveCel command — real inverse", () => {
	test("move clears the source and populates the destination; undo restores both", async () => {
		const store = twoLayerStore();
		const doc = asDoc(store);
		const history = new History();
		const src = store.getCel(store.layers[0]!.id, 0)!.data.slice();

		moveCel(
			doc,
			history,
			{ layerId: store.layers[0]!.id, frameIndex: 0 },
			{ layerId: "b", frameIndex: 0 },
			false,
		);
		expect(store.getCel(store.layers[0]!.id, 0)).toBeNull();
		expect(store.getCel("b", 0)!.data).toEqual(src);

		history.undo();
		await history.settle();
		expect(store.getCel(store.layers[0]!.id, 0)!.data).toEqual(src);
		expect(store.getCel("b", 0)).toBeNull();

		history.redo();
		await history.settle();
		expect(store.getCel(store.layers[0]!.id, 0)).toBeNull();
		expect(store.getCel("b", 0)!.data).toEqual(src);
	});

	test("copy leaves the source intact and clones into the destination", async () => {
		const store = twoLayerStore();
		const doc = asDoc(store);
		const history = new History();
		const src = store.getCel(store.layers[0]!.id, 0)!.data.slice();

		moveCel(
			doc,
			history,
			{ layerId: store.layers[0]!.id, frameIndex: 0 },
			{ layerId: "b", frameIndex: 0 },
			true,
		);
		expect(store.getCel(store.layers[0]!.id, 0)!.data).toEqual(src);
		expect(store.getCel("b", 0)!.data).toEqual(src);
		// The clone is a distinct buffer, not an alias of the source.
		expect(store.getCel("b", 0)).not.toBe(
			store.getCel(store.layers[0]!.id, 0),
		);

		history.undo();
		await history.settle();
		expect(store.getCel(store.layers[0]!.id, 0)!.data).toEqual(src);
		expect(store.getCel("b", 0)).toBeNull();
	});

	test("moving onto a populated cell overwrites it; undo restores the prior occupant", async () => {
		const store = twoLayerStore();
		const doc = asDoc(store);
		const history = new History();
		const srcId = store.layers[0]!.id;
		store.putCel("b", 0, painted(4, 99));
		const src = store.getCel(srcId, 0)!.data.slice();
		const dstBefore = store.getCel("b", 0)!.data.slice();

		moveCel(
			doc,
			history,
			{ layerId: srcId, frameIndex: 0 },
			{ layerId: "b", frameIndex: 0 },
			false,
		);
		expect(store.getCel("b", 0)!.data).toEqual(src);

		history.undo();
		await history.settle();
		expect(store.getCel(srcId, 0)!.data).toEqual(src);
		expect(store.getCel("b", 0)!.data).toEqual(dstBefore);
	});

	test("dropping onto the same cell, or dragging an empty cel, records nothing", () => {
		const store = twoLayerStore();
		const doc = asDoc(store);
		const history = new History();
		const srcId = store.layers[0]!.id;

		moveCel(
			doc,
			history,
			{ layerId: srcId, frameIndex: 0 },
			{ layerId: srcId, frameIndex: 0 },
			false,
		);
		// "b" cel 0 is empty → nothing to move.
		moveCel(
			doc,
			history,
			{ layerId: "b", frameIndex: 0 },
			{ layerId: srcId, frameIndex: 0 },
			false,
		);
		expect(history.canUndo).toBe(false);
	});
});
