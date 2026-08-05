import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { runCommand } from "../src/editor/sprite/command-router";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import {
	getClipboard,
	setClipboard,
} from "../src/editor/sprite/selection-clipboard";
import { SelectionController } from "../src/editor/sprite/selection-controller";
import { rectMask } from "../src/editor/sprite/selection-mask";
import { SpriteEditCore } from "../src/editor/sprite/sprite-edit-core";

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

const alpha = (core: SpriteEditCore, x: number, y: number): number =>
	core.getCel(core.activeLayerId, 0)?.data[
		(y * core.width + x) * 4 + 3
	] ?? 0;

const setup = () => {
	const core = SpriteEditCore.create(4, 4);
	const history = new History();
	const sel = new SelectionController(core, history);
	return { core, history, sel, layerId: core.activeLayerId };
};

describe("move: lift → commit", () => {
	test("lift then commit at zero offset restores the exact cel (identity)", () => {
		const { core, history, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		const original = Array.from(core.getCel(layerId, 0)!.data);

		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		expect(sel.state.kind).toBe("marquee");
		expect(sel.beginMove()).toBe(true);
		expect(sel.state.kind).toBe("floating");

		sel.commit();
		expect(sel.state.kind).toBe("marquee");
		expect(Array.from(core.getCel(layerId, 0)!.data)).toEqual(
			original,
		);
		expect(history.canUndo).toBe(true);
	});

	test("dragging then committing places the pixels at the new location", () => {
		const { core, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);
		sel.commit();
		expect(alpha(core, 1, 1)).toBe(0);
		expect(alpha(core, 2, 1)).toBe(255);
	});

	test("undoing a committed move restores the pre-move cel", async () => {
		const { core, history, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);
		sel.commit();
		history.undo();
		await history.settle();
		expect(alpha(core, 1, 1)).toBe(255);
		expect(alpha(core, 2, 1)).toBe(0);
	});
});

describe("cut / copy / paste", () => {
	test("cut clears the cel and records one undo entry; copy leaves it", async () => {
		const { core, history, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");

		sel.cut();
		expect(alpha(core, 1, 1)).toBe(0);
		expect(getClipboard()).not.toBeNull();
		expect(history.canUndo).toBe(true);
		expect(sel.state.kind).toBe("marquee");

		history.undo();
		await history.settle();
		expect(alpha(core, 1, 1)).toBe(255);
	});

	test("copy then paste floats the copied pixels and commit stamps them", () => {
		const { core, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.copy();
		expect(alpha(core, 1, 1)).toBe(255); // copy leaves the cel intact

		core.setCel(layerId, 0, null); // wipe the cel
		sel.clear();
		sel.paste();
		expect(sel.state.kind).toBe("floating");
		sel.commit();
		expect(alpha(core, 1, 1)).toBe(255); // pasted pixel landed
	});
});

describe("floating-commit choke-point", () => {
	test("commitPendingFloatingEdit stamps once and is idempotent", async () => {
		const { core, history, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);

		core.commitPendingFloatingEdit();
		expect(sel.state.kind).toBe("marquee");
		expect(alpha(core, 2, 1)).toBe(255);
		expect(history.canUndo).toBe(true);

		// A second call finds no float: no additional undo entry.
		core.commitPendingFloatingEdit();
		history.undo();
		await history.settle();
		expect(history.canRedo).toBe(true);
		expect(history.canUndo).toBe(false);
	});

	test("an unrelated command commits the float first (two entries)", async () => {
		const { core, history, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(1, 0);

		runCommand(core, history, { redo: () => {}, undo: () => {} });
		// The float committed before the command ran.
		expect(alpha(core, 2, 1)).toBe(255);
		expect(sel.state.kind).toBe("marquee");

		history.undo(); // undo the unrelated command (no-op)
		await history.settle();
		expect(alpha(core, 2, 1)).toBe(255);
		history.undo(); // undo the float commit
		await history.settle();
		expect(alpha(core, 1, 1)).toBe(255);
		expect(alpha(core, 2, 1)).toBe(0);
	});
});

describe("undo restores the selection", () => {
	test("undoing a command restores the marquee active when it ran", async () => {
		const { core, history, sel } = setup();
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		runCommand(core, history, { redo: () => {}, undo: () => {} });
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
		const { core, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
		sel.applyRegion(rectMask(4, 4, 1, 1, 1, 1), "replace");
		sel.beginMove();
		sel.dragTo(2, 0);
		sel.escape();
		expect(alpha(core, 1, 1)).toBe(255);
		expect(alpha(core, 3, 1)).toBe(0);
		expect(sel.state.kind).toBe("marquee");
	});

	test("escaping a paste drops it without touching the cel", () => {
		const { core, sel, layerId } = setup();
		core.setCel(layerId, 0, solid(4, 4, 1, 1));
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
		expect(alpha(core, 3, 3)).toBe(0);
	});
});
