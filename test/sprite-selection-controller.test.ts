import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { runCommand } from "../src/editor/sprite/command-router";
import { CelStore } from "../src/editor/sprite/cel-store";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import {
	getClipboard,
	setClipboard,
} from "../src/editor/sprite/selection-clipboard";
import { SelectionController } from "../src/editor/sprite/selection-controller";
import { rectMask } from "../src/editor/sprite/selection-mask";
import type {
	SelectionSnapshot,
	SpriteDocument,
} from "../src/editor/sprite/sprite-document";

/**
 * A canvas-free stand-in for {@link SpriteDocument}: a real {@link CelStore} for
 * the cel model plus the exact B12 choke-point plumbing (floating-commit
 * callback + selection bridge) the document implements, so the controller's
 * real state machine and undo interaction are exercised headlessly against the
 * artifact that ships.
 */
const fakeDoc = (store: CelStore): SpriteDocument => {
	let floatingCommit: (() => void) | null = null;
	let bridge: {
		capture: () => SelectionSnapshot | null;
		restore: (s: SelectionSnapshot | null) => void;
	} | null = null;
	return {
		get width() {
			return store.width;
		},
		get height() {
			return store.height;
		},
		get activeLayerId() {
			return store.activeLayerId;
		},
		get activeFrameIndex() {
			return store.activeFrameIndex;
		},
		getCel: (l: string, f: number) => store.getCel(l, f),
		setCel: (l: string, f: number, p: unknown) =>
			store.setCel(l, f, p as never),
		registerFloatingCommit: (fn: (() => void) | null) => {
			floatingCommit = fn;
		},
		commitPendingFloatingEdit: () => floatingCommit?.(),
		registerSelectionBridge: (b: typeof bridge) => {
			bridge = b;
		},
		captureSelection: () => bridge?.capture() ?? null,
		restoreSelection: (s: SelectionSnapshot | null) =>
			bridge?.restore(s),
	} as unknown as SpriteDocument;
};

const solid = (
	w: number,
	h: number,
	x: number,
	y: number,
	r = 200,
) => {
	const buf = blankPixels(w, h);
	const i = (y * w + x) * 4;
	buf.data[i] = r;
	buf.data[i + 3] = 255;
	return buf;
};

const alpha = (store: CelStore, x: number, y: number): number =>
	store.getCel(store.activeLayerId, 0)?.data[
		(y * store.width + x) * 4 + 3
	] ?? 0;

const setup = () => {
	const store = new CelStore(4, 4);
	const doc = fakeDoc(store);
	const history = new History();
	const sel = new SelectionController(doc, history);
	return { store, doc, history, sel, layerId: store.activeLayerId };
};

describe("move: lift → commit", () => {
	test("lift then commit at zero offset restores the exact cel (identity)", () => {
		const { store, history, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		const original = Array.from(store.getCel(layerId, 0)!.data);

		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		expect(sel.state.kind).toBe("marquee");
		expect(sel.beginMove()).toBe(true);
		expect(sel.state.kind).toBe("floating");

		sel.commit();
		expect(sel.state.kind).toBe("marquee");
		expect(Array.from(store.getCel(layerId, 0)!.data)).toEqual(
			original,
		);
		expect(history.canUndo).toBe(true);
	});

	test("dragging then committing places the pixels at the new location", () => {
		const { store, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);
		sel.commit();
		expect(alpha(store, 1, 1)).toBe(0);
		expect(alpha(store, 2, 1)).toBe(255);
	});

	test("undoing a committed move restores the pre-move cel", async () => {
		const { store, history, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);
		sel.commit();
		history.undo();
		await history.settle();
		expect(alpha(store, 1, 1)).toBe(255);
		expect(alpha(store, 2, 1)).toBe(0);
	});
});

describe("cut / copy / paste", () => {
	test("cut clears the cel and records one undo entry; copy leaves it", async () => {
		const { store, history, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");

		sel.cut();
		expect(alpha(store, 1, 1)).toBe(0);
		expect(getClipboard()).not.toBeNull();
		expect(history.canUndo).toBe(true);
		expect(sel.state.kind).toBe("marquee");

		history.undo();
		await history.settle();
		expect(alpha(store, 1, 1)).toBe(255);
	});

	test("copy then paste floats the copied pixels and commit stamps them", () => {
		const { store, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.copy();
		expect(alpha(store, 1, 1)).toBe(255); // copy leaves the cel intact

		store.setCel(layerId, 0, null); // wipe the cel
		sel.clear();
		sel.paste();
		expect(sel.state.kind).toBe("floating");
		sel.commit();
		expect(alpha(store, 1, 1)).toBe(255); // pasted pixel landed
	});
});

describe("floating-commit choke-point", () => {
	test("commitPendingFloatingEdit stamps once and is idempotent", async () => {
		const { store, doc, history, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);

		doc.commitPendingFloatingEdit();
		expect(sel.state.kind).toBe("marquee");
		expect(alpha(store, 2, 1)).toBe(255);
		expect(history.canUndo).toBe(true);

		// A second call finds no float: no additional undo entry.
		doc.commitPendingFloatingEdit();
		history.undo();
		await history.settle();
		expect(history.canRedo).toBe(true);
		expect(history.canUndo).toBe(false);
	});

	test("an unrelated command commits the float first (two entries)", async () => {
		const { store, doc, history, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);

		runCommand(doc, history, { redo: () => {}, undo: () => {} });
		// The float committed before the command ran.
		expect(alpha(store, 2, 1)).toBe(255);
		expect(sel.state.kind).toBe("marquee");

		history.undo(); // undo the unrelated command (no-op)
		await history.settle();
		expect(alpha(store, 2, 1)).toBe(255);
		history.undo(); // undo the float commit
		await history.settle();
		expect(alpha(store, 1, 1)).toBe(255);
		expect(alpha(store, 2, 1)).toBe(0);
	});
});

describe("undo restores the selection", () => {
	test("undoing a command restores the marquee active when it ran", async () => {
		const { doc, history, sel } = setup();
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		runCommand(doc, history, { redo: () => {}, undo: () => {} });
		sel.applyRegion(rectMask(4, 4, 2, 2, 2, 2), "replace");

		history.undo();
		await history.settle();
		const state = sel.state;
		expect(state.kind).toBe("marquee");
		if (state.kind === "marquee") {
			expect(state.mask.data[1 * 4 + 1]).toBe(1);
			expect(state.mask.data[2 * 4 + 2]).toBe(0);
		}
	});
});

describe("escape", () => {
	test("escaping a move restores the lifted pixels and the marquee", () => {
		const { store, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(2, 0);
		sel.escape();
		expect(alpha(store, 1, 1)).toBe(255);
		expect(alpha(store, 3, 1)).toBe(0);
		expect(sel.state.kind).toBe("marquee");
	});

	test("escaping a paste drops it without touching the cel", () => {
		const { store, sel, layerId } = setup();
		store.putCel(layerId, 0, solid(4, 4, 1, 1));
		setClipboard({
			pixels: solid(1, 1, 0, 0),
			mask: { width: 1, height: 1, data: new Uint8Array([1]) },
			originX: 3,
			originY: 3,
			width: 1,
			height: 1,
		});
		sel.clear();
		sel.paste();
		expect(sel.state.kind).toBe("floating");
		sel.escape();
		expect(sel.state.kind).toBe("none");
		expect(alpha(store, 3, 3)).toBe(0);
	});
});
