import { describe, expect, test } from "bun:test";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import {
	cropClip,
	liftSelection,
	placeClip,
	stampFloating,
} from "../src/editor/sprite/selection-lift";
import {
	combineMask,
	createMask,
	lassoMask,
	maskBounds,
	maskContains,
	maskIsEmpty,
	rectMask,
	selectionOp,
	translateMask,
	wandMask,
} from "../src/editor/sprite/selection-mask";

const solid = (
	w: number,
	h: number,
	x: number,
	y: number,
	r = 10,
	g = 20,
	b = 30,
) => {
	const buf = blankPixels(w, h);
	const i = (y * w + x) * 4;
	buf.data[i] = r;
	buf.data[i + 1] = g;
	buf.data[i + 2] = b;
	buf.data[i + 3] = 255;
	return buf;
};

describe("rectMask", () => {
	test("covers the inclusive box in either point order, clipped to canvas", () => {
		const m = rectMask(4, 4, 3, 2, 1, 1);
		const cells: string[] = [];
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				if (maskContains(m, x, y)) {
					cells.push(`${x},${y}`);
				}
			}
		}
		expect(new Set(cells)).toEqual(
			new Set(["1,1", "2,1", "3,1", "1,2", "2,2", "3,2"]),
		);
	});

	test("bounds report the inclusive extent", () => {
		expect(maskBounds(rectMask(8, 8, 2, 3, 4, 5))).toEqual({
			x0: 2,
			y0: 3,
			x1: 4,
			y1: 5,
		});
		expect(maskBounds(createMask(4, 4))).toBeNull();
	});
});

describe("lassoMask", () => {
	test("fills a triangle interior (even-odd) plus its outline", () => {
		const m = lassoMask(6, 6, [
			[0, 0],
			[4, 0],
			[0, 4],
		]);
		// A cell well inside the triangle is selected.
		expect(maskContains(m, 1, 1)).toBe(true);
		// A cell outside the hypotenuse is not.
		expect(maskContains(m, 4, 4)).toBe(false);
		expect(maskIsEmpty(m)).toBe(false);
	});

	test("a degenerate path selects nothing", () => {
		expect(maskIsEmpty(lassoMask(4, 4, [[1, 1]]))).toBe(true);
	});
});

describe("wandMask", () => {
	test("contiguous selects the connected same-colour region", () => {
		const buf = blankPixels(3, 1);
		// pixels: [red, red, transparent]
		for (const x of [0, 1]) {
			const i = x * 4;
			buf.data[i] = 255;
			buf.data[i + 3] = 255;
		}
		const m = wandMask(buf, 0, 0, 0, true);
		expect(maskContains(m, 0, 0)).toBe(true);
		expect(maskContains(m, 1, 0)).toBe(true);
		expect(maskContains(m, 2, 0)).toBe(false);
	});

	test("global selects all matching cells regardless of connectivity", () => {
		const buf = blankPixels(3, 1);
		// pixels: [transparent, red, transparent] — seed transparent, global.
		buf.data[4] = 255;
		buf.data[7] = 255;
		const m = wandMask(buf, 0, 0, 0, false);
		expect(maskContains(m, 0, 0)).toBe(true);
		expect(maskContains(m, 2, 0)).toBe(true);
		expect(maskContains(m, 1, 0)).toBe(false);
	});

	test("tolerance widens the match", () => {
		const buf = blankPixels(2, 1);
		buf.data[3] = 255;
		buf.data[4] = 10; // near-black, opaque-ish
		buf.data[7] = 255;
		const strict = wandMask(buf, 0, 0, 0, false);
		expect(maskContains(strict, 1, 0)).toBe(false);
		const loose = wandMask(buf, 0, 0, 20, false);
		expect(maskContains(loose, 1, 0)).toBe(true);
	});
});

describe("combineMask ops", () => {
	const a = rectMask(4, 1, 0, 0, 1, 0); // {0,1}
	const b = rectMask(4, 1, 1, 0, 2, 0); // {1,2}

	test("add unions", () => {
		const m = combineMask(a, b, "add");
		expect([0, 1, 2, 3].map((x) => maskContains(m, x, 0))).toEqual([
			true,
			true,
			true,
			false,
		]);
	});
	test("subtract removes", () => {
		const m = combineMask(a, b, "subtract");
		expect([0, 1, 2, 3].map((x) => maskContains(m, x, 0))).toEqual([
			true,
			false,
			false,
			false,
		]);
	});
	test("intersect keeps overlap", () => {
		const m = combineMask(a, b, "intersect");
		expect([0, 1, 2, 3].map((x) => maskContains(m, x, 0))).toEqual([
			false,
			true,
			false,
			false,
		]);
	});
	test("replace discards the base", () => {
		const m = combineMask(a, b, "replace");
		expect([0, 1, 2, 3].map((x) => maskContains(m, x, 0))).toEqual([
			false,
			true,
			true,
			false,
		]);
	});
});

describe("selectionOp modifier mapping", () => {
	test("Shift add, Alt subtract, both intersect, neither replace", () => {
		expect(selectionOp(false, false)).toBe("replace");
		expect(selectionOp(true, false)).toBe("add");
		expect(selectionOp(false, true)).toBe("subtract");
		expect(selectionOp(true, true)).toBe("intersect");
	});
});

describe("lift / stamp round trip", () => {
	test("lift then stamp at zero offset reproduces the cel exactly", () => {
		const cel = solid(4, 4, 1, 1);
		const mask = rectMask(4, 4, 1, 1, 1, 1);
		const { lifted, residue } = liftSelection(cel, mask);
		// residue has the hole, lifted holds only the masked pixel.
		expect(residue.data[(1 * 4 + 1) * 4 + 3]).toBe(0);
		expect(lifted.data[(1 * 4 + 1) * 4 + 3]).toBe(255);
		const back = stampFloating(residue, lifted, 0, 0);
		expect(Array.from(back.data)).toEqual(Array.from(cel.data));
	});

	test("moving the offset then stamping places pixels at the new location", () => {
		const cel = solid(4, 4, 1, 1);
		const mask = rectMask(4, 4, 1, 1, 1, 1);
		const { lifted, residue } = liftSelection(cel, mask);
		const out = stampFloating(residue, lifted, 1, 0);
		expect(out.data[(1 * 4 + 1) * 4 + 3]).toBe(0); // original cleared
		expect(out.data[(1 * 4 + 2) * 4 + 3]).toBe(255); // moved one right
	});
});

describe("clip crop / place", () => {
	test("crop captures the shaped region and place restores it", () => {
		const cel = solid(4, 4, 2, 3, 5, 6, 7);
		const mask = rectMask(4, 4, 2, 3, 2, 3);
		const { lifted } = liftSelection(cel, mask);
		const clip = cropClip(lifted, mask)!;
		expect(clip.originX).toBe(2);
		expect(clip.originY).toBe(3);
		expect(clip.width).toBe(1);
		expect(clip.height).toBe(1);
		const placed = placeClip(4, 4, clip, 0, 0);
		expect(placed.lifted.data[0]).toBe(5);
		expect(placed.lifted.data[3]).toBe(255);
		expect(maskContains(placed.mask, 0, 0)).toBe(true);
	});

	test("cropClip of an empty mask is null", () => {
		expect(cropClip(blankPixels(2, 2), createMask(2, 2))).toBeNull();
	});
});

describe("translateMask", () => {
	test("shifts selected cells and drops those that fall off", () => {
		const m = translateMask(rectMask(3, 1, 0, 0, 0, 0), 1, 0);
		expect(maskContains(m, 1, 0)).toBe(true);
		expect(maskContains(m, 0, 0)).toBe(false);
		const off = translateMask(rectMask(3, 1, 2, 0, 2, 0), 1, 0);
		expect(maskIsEmpty(off)).toBe(true);
	});
});
