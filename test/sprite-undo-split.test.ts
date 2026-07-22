import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { CelStore } from "../src/editor/sprite/cel-store";
import {
	addLayer,
	commitLayerOpacity,
	commitLayerOrder,
	deleteLayer,
	renameLayer,
	setLayerBlend,
	setLayerVisible,
} from "../src/editor/sprite/layer-commands";
import { recordStroke } from "../src/editor/sprite/stroke";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import type {
	SelectionSnapshot,
	SpriteDocument,
} from "../src/editor/sprite/sprite-document";

/**
 * The structural + pixel undo commands are exercised against the **real**
 * canvas-free {@link CelStore} — not a hand-written double — so the assertions
 * cover the artifact that ships. `withHooks` attaches the three inert
 * choke-point hooks {@link runCommand} calls (the DOM {@link SpriteDocument}
 * implements them via bridges) so the store can stand in for the document.
 */
const withHooks = (
	store: CelStore,
	hooks: Partial<{
		commit: () => void;
		capture: () => SelectionSnapshot | null;
		restore: (s: SelectionSnapshot | null) => void;
	}> = {},
): SpriteDocument => {
	const target = store as unknown as {
		commitPendingFloatingEdit: () => void;
		captureSelection: () => SelectionSnapshot | null;
		restoreSelection: (s: SelectionSnapshot | null) => void;
	};
	target.commitPendingFloatingEdit = hooks.commit ?? (() => {});
	target.captureSelection = hooks.capture ?? (() => null);
	target.restoreSelection = hooks.restore ?? (() => {});
	return store as unknown as SpriteDocument;
};

const painted = (index: number, value: number) => {
	const buf = blankPixels(2, 2);
	buf.data[index] = value;
	buf.data[index + 3] = 255;
	return buf;
};

describe("structural commands — real inverses", () => {
	test("add layer, then undo removes it and redo restores it", async () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();

		addLayer(doc, history);
		expect(doc.layers.length).toBe(2);
		const addedId = doc.activeLayerId;

		history.undo();
		await history.settle();
		expect(doc.layers.length).toBe(1);
		expect(doc.layers.some((l) => l.id === addedId)).toBe(false);

		history.redo();
		await history.settle();
		expect(doc.layers.length).toBe(2);
		expect(doc.layers.map((l) => l.id)).toContain(addedId);
		expect(doc.activeLayerId).toBe(addedId);
	});

	test("delete a painted layer: undo restores it at its index with identical pixels across frames + properties", async () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();

		addLayer(doc, history);
		addLayer(doc, history);
		const targetId = doc.layers[1]!.id;
		doc.setActiveLayer(targetId);

		// Paint the layer on two different frames.
		store.insertFrame(1, 100);
		store.putCel(targetId, 0, painted(0, 200));
		store.putCel(targetId, 1, painted(4, 99));
		setLayerBlend(doc, history, targetId, "multiply");
		setLayerVisible(doc, history, targetId, false);
		renameLayer(doc, history, targetId, "Painted");
		const frame0 = store.getCel(targetId, 0)!.data.slice();
		const frame1 = store.getCel(targetId, 1)!.data.slice();

		deleteLayer(doc, history, targetId);
		expect(doc.layers.some((l) => l.id === targetId)).toBe(false);
		expect(store.getCel(targetId, 0)).toBeNull();

		history.undo();
		await history.settle();
		expect(doc.layers[1]!.id).toBe(targetId);
		expect(doc.layers[1]!.blend).toBe("multiply");
		expect(doc.layers[1]!.visible).toBe(false);
		expect(doc.layers[1]!.name).toBe("Painted");
		expect(store.getCel(targetId, 0)!.data).toEqual(frame0);
		expect(store.getCel(targetId, 1)!.data).toEqual(frame1);

		history.redo();
		await history.settle();
		expect(doc.layers.some((l) => l.id === targetId)).toBe(false);
	});

	test("deleting the last remaining layer is refused (records nothing)", () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		deleteLayer(doc, history, doc.activeLayerId);
		expect(doc.layers.length).toBe(1);
		expect(history.canUndo).toBe(false);
	});

	test("rename / blend / visibility / opacity undo/redo restore prior values", async () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		const id = doc.activeLayerId;

		renameLayer(doc, history, id, "Renamed");
		setLayerBlend(doc, history, id, "screen");
		setLayerVisible(doc, history, id, false);
		store.setOpacity(id, 0.4);
		commitLayerOpacity(doc, history, id, 1, 0.4);

		expect(doc.layers[0]!.name).toBe("Renamed");
		expect(doc.layers[0]!.blend).toBe("screen");
		expect(doc.layers[0]!.visible).toBe(false);
		expect(doc.layers[0]!.opacity).toBe(0.4);

		history.undo();
		await history.settle();
		expect(doc.layers[0]!.opacity).toBe(1);
		history.undo();
		await history.settle();
		expect(doc.layers[0]!.visible).toBe(true);
		history.undo();
		await history.settle();
		expect(doc.layers[0]!.blend).toBe("source-over");
		history.undo();
		await history.settle();
		expect(doc.layers[0]!.name).toBe("Layer 1");
	});

	test("reorder undo/redo restores the order arrays", async () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		addLayer(doc, history);
		addLayer(doc, history);

		const before = doc.layers.map((l) => l.id);
		const after = [before[2]!, before[0]!, before[1]!];
		store.setLayerOrder(after);
		commitLayerOrder(doc, history, before, after);
		expect(doc.layers.map((l) => l.id)).toEqual(after);

		history.undo();
		await history.settle();
		expect(doc.layers.map((l) => l.id)).toEqual(before);

		history.redo();
		await history.settle();
		expect(doc.layers.map((l) => l.id)).toEqual(after);
	});

	test("no-op edits record nothing", () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		const id = doc.activeLayerId;
		renameLayer(doc, history, id, "Layer 1");
		setLayerBlend(doc, history, id, "source-over");
		setLayerVisible(doc, history, id, true);
		commitLayerOpacity(doc, history, id, 1, 1);
		expect(history.canUndo).toBe(false);
	});
});

describe("no whole-document snapshot (the memory win)", () => {
	test("a rename captures no pixels; a delete captures exactly one layer", () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		addLayer(doc, history);
		const id = doc.activeLayerId;

		let snapshotLayerCalls = 0;
		const original = store.snapshotLayer.bind(store);
		store.snapshotLayer = (layerId: string) => {
			snapshotLayerCalls++;
			return original(layerId);
		};

		renameLayer(doc, history, id, "X");
		setLayerBlend(doc, history, id, "multiply");
		setLayerVisible(doc, history, id, false);
		expect(snapshotLayerCalls).toBe(0);

		deleteLayer(doc, history, id);
		expect(snapshotLayerCalls).toBe(1);
	});
});

describe("pixel commands interleave independently with structural ones", () => {
	test("a stroke undoes/redoes correctly across interleaved structural edits", async () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		const layerId = doc.activeLayerId;

		const before = doc.snapshot();
		store.putCel(layerId, 0, painted(0, 255));
		recordStroke(doc, history, before);
		const paintedData = store.getCel(layerId, 0)!.data.slice();

		renameLayer(doc, history, layerId, "Base");

		history.undo();
		await history.settle();
		expect(doc.layers[0]!.name).toBe("Layer 1");
		expect(store.getCel(layerId, 0)!.data).toEqual(paintedData);

		history.undo();
		await history.settle();
		expect(store.getCel(layerId, 0)).toBeNull();

		history.redo();
		await history.settle();
		expect(store.getCel(layerId, 0)!.data).toEqual(paintedData);
	});

	test("a stroke that changed nothing records no entry", () => {
		const store = new CelStore(2, 2);
		const doc = withHooks(store);
		const history = new History();
		const before = doc.snapshot();
		recordStroke(doc, history, before);
		expect(history.canUndo).toBe(false);
	});
});

describe("choke-point hooks (Phase 3 plumbing, inert today)", () => {
	test("every command commits a pending floating edit before executing", () => {
		const events: string[] = [];
		const store = new CelStore(2, 2);
		const doc = withHooks(store, {
			commit: () => events.push("floating-commit"),
		});
		const history = new History();

		renameLayer(doc, history, doc.activeLayerId, "X");
		addLayer(doc, history);
		const before = doc.snapshot();
		store.putCel(doc.activeLayerId, 0, painted(0, 1));
		recordStroke(doc, history, before);

		expect(events).toEqual([
			"floating-commit",
			"floating-commit",
			"floating-commit",
		]);
	});

	test("undo restores the selection captured when the command ran", async () => {
		let current: SelectionSnapshot | null = { marquee: "A" };
		const restored: Array<SelectionSnapshot | null> = [];
		const store = new CelStore(2, 2);
		const doc = withHooks(store, {
			capture: () => current,
			restore: (snap) => restored.push(snap),
		});
		const history = new History();

		renameLayer(doc, history, doc.activeLayerId, "X");
		current = { marquee: "B" };

		history.undo();
		await history.settle();
		expect(restored).toEqual([{ marquee: "A" }]);
	});
});
