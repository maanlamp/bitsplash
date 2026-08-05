import { describe, expect, test } from "bun:test";
import { History } from "../src/editor/history";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import { SelectionController } from "../src/editor/sprite/selection-controller";
import {
	maskBounds,
	rectMask,
} from "../src/editor/sprite/selection-mask";
import { SpriteEditCore } from "../src/editor/sprite/sprite-edit-core";

/** Fill a rectangular opaque block on the active cel. */
const fillBlock = (
	core: SpriteEditCore,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	r = 200,
): void => {
	const cel = blankPixels(core.width, core.height);
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const i = (y * core.width + x) * 4;
			cel.data[i] = r;
			cel.data[i + 3] = 255;
		}
	}
	core.setCel(core.activeLayerId, 0, cel);
};

const alpha = (core: SpriteEditCore, x: number, y: number): number =>
	core.getCel(core.activeLayerId, 0)?.data[
		(y * core.width + x) * 4 + 3
	] ?? 0;

const setup = () => {
	const core = SpriteEditCore.create(32, 32);
	const history = new History();
	const sel = new SelectionController(core, history);
	return { core, history, sel };
};

describe("rotateArbitrary (RotSprite on the float)", () => {
	test("lifts a marquee to a float and rotates it", () => {
		const { core, sel } = setup();
		fillBlock(core, 10, 12, 20, 16);
		sel.applyRegion(rectMask(32, 32, 10, 12, 20, 16), "replace");
		expect(sel.rotateArbitrary(30)).toBe(true);
		expect(sel.state.kind).toBe("floating");
		if (sel.state.kind === "floating") {
			// A 30° rotation of an 11×5 block grows its footprint height.
			const b = maskBounds(sel.state.mask)!;
			expect(b.y1 - b.y0 + 1).toBeGreaterThan(5);
		}
	});

	test("no selection: returns false", () => {
		const { sel } = setup();
		expect(sel.rotateArbitrary(45)).toBe(false);
	});

	test("commit after rotate writes once and is one undo entry", async () => {
		const { core, history, sel } = setup();
		fillBlock(core, 8, 8, 16, 16);
		sel.applyRegion(rectMask(32, 32, 8, 8, 16, 16), "replace");
		sel.rotateArbitrary(90);
		sel.commit();
		expect(history.canUndo).toBe(true);
		// One undo restores the pre-lift cel exactly.
		const opaqueAfter = countOpaque(core);
		expect(opaqueAfter).toBeGreaterThan(0);
		history.undo();
		await history.settle();
		// The original 9×9 block (81 px) is restored.
		expect(countOpaque(core)).toBe(9 * 9);
		history.redo();
		await history.settle();
		expect(countOpaque(core)).toBe(opaqueAfter);
		// Exactly one entry: a second undo is a no-op.
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});
});

const countOpaque = (core: SpriteEditCore): number => {
	const cel = core.getCel(core.activeLayerId, 0);
	if (!cel) {
		return 0;
	}
	let n = 0;
	for (let i = 3; i < cel.data.length; i += 4) {
		if (cel.data[i]! > 0) {
			n++;
		}
	}
	return n;
};

describe("free transform (interactive session)", () => {
	test("beginTransform lifts a marquee and starts an identity session", () => {
		const { core, sel } = setup();
		fillBlock(core, 10, 10, 14, 14);
		sel.applyRegion(rectMask(32, 32, 10, 10, 14, 14), "replace");
		expect(sel.beginTransform()).toBe(true);
		expect(sel.transforming).toBe(true);
		const session = sel.transformSession!;
		// Pivot seeded at the float's bounds centre.
		expect(session.pivot.x).toBeCloseTo(12.5, 6);
		expect(session.pivot.y).toBeCloseTo(12.5, 6);
		// Identity leaves the footprint unchanged (5×5 at (10,10)).
		if (sel.state.kind === "floating") {
			const b = maskBounds(sel.state.mask)!;
			expect(b).toEqual({ x0: 10, y0: 10, x1: 14, y1: 14 });
		}
	});

	test("scale 2× about the pivot doubles the float footprint", () => {
		const { core, sel } = setup();
		fillBlock(core, 12, 12, 15, 15); // 4×4
		sel.applyRegion(rectMask(32, 32, 12, 12, 15, 15), "replace");
		sel.beginTransform();
		sel.updateTransform({ scaleX: 2, scaleY: 2 });
		if (sel.state.kind === "floating") {
			const b = maskBounds(sel.state.mask)!;
			expect(b.x1 - b.x0 + 1).toBe(8);
			expect(b.y1 - b.y0 + 1).toBe(8);
		} else {
			throw new Error("expected floating");
		}
	});

	test("confirm bakes the transform; a following commit writes it once", () => {
		const { core, sel } = setup();
		fillBlock(core, 12, 12, 15, 15);
		sel.applyRegion(rectMask(32, 32, 12, 12, 15, 15), "replace");
		sel.beginTransform();
		sel.updateTransform({ scaleX: 2, scaleY: 2 });
		sel.confirmTransform();
		expect(sel.transforming).toBe(false);
		expect(sel.state.kind).toBe("floating");
		sel.commit();
		// The scaled 8×8 block is now on the cel.
		expect(countOpaque(core)).toBe(8 * 8);
	});

	test("cancel restores the untransformed float, staying floating", () => {
		const { core, sel } = setup();
		fillBlock(core, 12, 12, 15, 15);
		sel.applyRegion(rectMask(32, 32, 12, 12, 15, 15), "replace");
		sel.beginTransform();
		sel.updateTransform({ scaleX: 3, scaleY: 3 });
		sel.cancelTransform();
		expect(sel.transforming).toBe(false);
		expect(sel.state.kind).toBe("floating");
		if (sel.state.kind === "floating") {
			const b = maskBounds(sel.state.mask)!;
			expect(b).toEqual({ x0: 12, y0: 12, x1: 15, y1: 15 });
		}
	});

	test("pivot-centred 90° rotation matches an exact rotateCw footprint", () => {
		const { core, sel } = setup();
		fillBlock(core, 10, 12, 18, 14); // 9 wide × 3 tall
		sel.applyRegion(rectMask(32, 32, 10, 12, 18, 14), "replace");
		sel.beginTransform();
		sel.updateTransform({ rotate: Math.PI / 2 });
		if (sel.state.kind === "floating") {
			const b = maskBounds(sel.state.mask)!;
			// 9×3 becomes 3×9, re-centred about the same pivot (14, 13).
			expect(b.x1 - b.x0 + 1).toBe(3);
			expect(b.y1 - b.y0 + 1).toBe(9);
		} else {
			throw new Error("expected floating");
		}
	});

	test("escape cancels the transform first, then drops the float", () => {
		const { core, sel } = setup();
		fillBlock(core, 12, 12, 15, 15);
		sel.applyRegion(rectMask(32, 32, 12, 12, 15, 15), "replace");
		sel.beginTransform();
		sel.updateTransform({ scaleX: 2, scaleY: 2 });
		sel.escape(); // cancel transform, stay floating
		expect(sel.transforming).toBe(false);
		expect(sel.state.kind).toBe("floating");
		sel.escape(); // drop the float back to a marquee
		expect(sel.state.kind).toBe("marquee");
		// The cel is untouched (escape never committed).
		expect(alpha(core, 12, 12)).toBe(255);
	});

	test("confirmOrCommit confirms while transforming, else commits", () => {
		const { core, sel } = setup();
		fillBlock(core, 12, 12, 15, 15);
		sel.applyRegion(rectMask(32, 32, 12, 12, 15, 15), "replace");
		sel.beginTransform();
		sel.updateTransform({ scaleX: 2, scaleY: 2 });
		sel.confirmOrCommit(); // confirms transform
		expect(sel.transforming).toBe(false);
		expect(sel.state.kind).toBe("floating");
		sel.confirmOrCommit(); // commits float
		expect(sel.state.kind).toBe("marquee");
		expect(countOpaque(core)).toBe(8 * 8);
	});
});
