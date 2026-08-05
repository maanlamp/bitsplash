import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { moveCel } from "../src/editor/sprite/cel-commands";
import {
	blankPixels,
	type PixelBuffer,
} from "../src/editor/sprite/pixel-buffer";
import { SpriteEditCore } from "../src/editor/sprite/sprite-edit-core";

const painted = (index: number, value: number): PixelBuffer => {
	const buf = blankPixels(2, 2);
	buf.data[index] = value;
	buf.data[index + 3] = 255;
	return buf;
};

/**
 * Two layers on one frame, with the lower one painted — built on the real
 * canvas-free {@link SpriteEditCore}, so the command runs against the artifact
 * that ships rather than a double.
 */
const twoLayerCore = (): SpriteEditCore => {
	const core = SpriteEditCore.create(2, 2);
	const a = core.activeLayerId;
	core.insertLayer(
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
	core.setCel(a, 0, painted(0, 200));
	return core;
};

describe("moveCel command — real inverse", () => {
	test("move clears the source and populates the destination; undo restores both", async () => {
		const core = twoLayerCore();
		const history = new History();
		const src = core.getCel(core.layers[0]!.id, 0)!.data.slice();

		moveCel(
			core,
			history,
			{ layerId: core.layers[0]!.id, frameIndex: 0 },
			{ layerId: "b", frameIndex: 0 },
			false,
		);
		expect(core.getCel(core.layers[0]!.id, 0)).toBeNull();
		expect(core.getCel("b", 0)!.data).toEqual(src);

		history.undo();
		await history.settle();
		expect(core.getCel(core.layers[0]!.id, 0)!.data).toEqual(src);
		expect(core.getCel("b", 0)).toBeNull();

		history.redo();
		await history.settle();
		expect(core.getCel(core.layers[0]!.id, 0)).toBeNull();
		expect(core.getCel("b", 0)!.data).toEqual(src);
	});

	test("copy leaves the source intact and clones into the destination", async () => {
		const core = twoLayerCore();
		const history = new History();
		const src = core.getCel(core.layers[0]!.id, 0)!.data.slice();

		moveCel(
			core,
			history,
			{ layerId: core.layers[0]!.id, frameIndex: 0 },
			{ layerId: "b", frameIndex: 0 },
			true,
		);
		expect(core.getCel(core.layers[0]!.id, 0)!.data).toEqual(src);
		expect(core.getCel("b", 0)!.data).toEqual(src);
		// The clone is a distinct buffer, not an alias of the source.
		expect(core.getCel("b", 0)).not.toBe(
			core.getCel(core.layers[0]!.id, 0),
		);

		history.undo();
		await history.settle();
		expect(core.getCel(core.layers[0]!.id, 0)!.data).toEqual(src);
		expect(core.getCel("b", 0)).toBeNull();
	});

	test("moving onto a populated cell overwrites it; undo restores the prior occupant", async () => {
		const core = twoLayerCore();
		const history = new History();
		const srcId = core.layers[0]!.id;
		core.setCel("b", 0, painted(4, 99));
		const src = core.getCel(srcId, 0)!.data.slice();
		const dstBefore = core.getCel("b", 0)!.data.slice();

		moveCel(
			core,
			history,
			{ layerId: srcId, frameIndex: 0 },
			{ layerId: "b", frameIndex: 0 },
			false,
		);
		expect(core.getCel("b", 0)!.data).toEqual(src);

		history.undo();
		await history.settle();
		expect(core.getCel(srcId, 0)!.data).toEqual(src);
		expect(core.getCel("b", 0)!.data).toEqual(dstBefore);
	});

	test("dropping onto the same cell, or dragging an empty cel, records nothing", () => {
		const core = twoLayerCore();
		const history = new History();
		const srcId = core.layers[0]!.id;

		moveCel(
			core,
			history,
			{ layerId: srcId, frameIndex: 0 },
			{ layerId: srcId, frameIndex: 0 },
			false,
		);
		// "b" cel 0 is empty → nothing to move.
		moveCel(
			core,
			history,
			{ layerId: "b", frameIndex: 0 },
			{ layerId: srcId, frameIndex: 0 },
			false,
		);
		expect(history.canUndo).toBe(false);
	});
});
