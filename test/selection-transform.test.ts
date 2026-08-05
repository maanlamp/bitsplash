import { describe, expect, test } from "bun:test";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";
import {
	type SelectionClip,
	transformClip,
} from "../src/editor/sprite/selection-lift";
import { SelectionController } from "../src/editor/sprite/selection-controller";
import {
	createMask,
	rectMask,
} from "../src/editor/sprite/selection-mask";
import { History } from "../src/editor/history";
import { SpriteEditCore } from "../src/editor/sprite/sprite-edit-core";

/** A clip whose pixels carry a distinct colour per cell for unambiguous mapping. */
const rampClip = (
	width: number,
	height: number,
	originX = 0,
	originY = 0,
): SelectionClip => {
	const pixels = blankPixels(width, height);
	const mask = createMask(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			pixels.data[i] = x + 1;
			pixels.data[i + 1] = y + 1;
			pixels.data[i + 3] = 255;
			mask.data[y * width + x] = 1;
		}
	}
	return { pixels, mask, originX, originY, width, height };
};

describe("transformClip (pure buffer + mask + origin)", () => {
	test("flip twice is the identity on pixels and mask", () => {
		const clip = rampClip(3, 2);
		const h2 = transformClip(transformClip(clip, "flip-h"), "flip-h");
		expect(h2.pixels.data).toEqual(clip.pixels.data);
		expect(h2.mask.data).toEqual(clip.mask.data);
		const v2 = transformClip(transformClip(clip, "flip-v"), "flip-v");
		expect(v2.pixels.data).toEqual(clip.pixels.data);
	});

	test("rotate-cw swaps dimensions", () => {
		const out = transformClip(rampClip(3, 2), "rotate-cw");
		expect(out.width).toBe(2);
		expect(out.height).toBe(3);
		expect(out.pixels.width).toBe(2);
		expect(out.mask.width).toBe(2);
	});

	test("rotate-cw then rotate-ccw is the identity (pixels, mask, origin)", () => {
		const clip = rampClip(4, 2, 5, 3);
		const round = transformClip(
			transformClip(clip, "rotate-cw"),
			"rotate-ccw",
		);
		expect(round.pixels.data).toEqual(clip.pixels.data);
		expect(round.mask.data).toEqual(clip.mask.data);
		expect(round.width).toBe(clip.width);
		expect(round.height).toBe(clip.height);
		expect(round.originX).toBe(clip.originX);
		expect(round.originY).toBe(clip.originY);
	});

	test("rotate re-centres a non-square clip on its bounds centre", () => {
		// A 4×2 clip centred at (2, 1) becomes 2×4 still centred at (2, 1).
		const clip = rampClip(4, 2, 0, 0);
		const out = transformClip(clip, "rotate-cw");
		const cx0 = clip.originX + clip.width / 2;
		const cy0 = clip.originY + clip.height / 2;
		expect(out.originX + out.width / 2).toBe(cx0);
		expect(out.originY + out.height / 2).toBe(cy0);
	});

	test("a lasso-shaped (non-rectangular) mask is transformed with the pixels", () => {
		const clip = rampClip(3, 3);
		clip.mask.data.fill(0);
		clip.mask.data[0] = 1; // top-left only (row 0, col 0)
		const out = transformClip(clip, "flip-h");
		// top-left selected cell mirrors to top-right.
		expect(out.mask.data[2]).toBe(1);
		expect(out.mask.data[0]).toBe(0);
	});
});

const alpha = (core: SpriteEditCore, x: number, y: number): number =>
	core.getCel(core.activeLayerId, 0)?.data[
		(y * core.width + x) * 4 + 3
	] ?? 0;

describe("SelectionController transforms (float buffer + mask + offset)", () => {
	const setup = () => {
		const core = SpriteEditCore.create(8, 8);
		const history = new History();
		const sel = new SelectionController(core, history);
		return { core, sel, layerId: core.activeLayerId };
	};

	test("flip of a marquee lifts to a float and mirrors in place", () => {
		const { core, sel, layerId } = setup();
		const cel = blankPixels(8, 8);
		// Two-cell horizontal bar at (2,2)-(3,2): make (2,2) opaque, (3,2) opaque
		// with a marker so the mirror is observable.
		for (const x of [2, 3]) {
			const i = (2 * 8 + x) * 4;
			cel.data[i] = x === 2 ? 100 : 200;
			cel.data[i + 3] = 255;
		}
		core.setCel(layerId, 0, cel);
		sel.applyRegion(rectMask(8, 8, 2, 2, 3, 2), "replace");
		expect(sel.flipHorizontal()).toBe(true);
		expect(sel.state.kind).toBe("floating");
		if (sel.state.kind === "floating") {
			// Within the 2-wide bounds, columns 2 and 3 swap colours.
			const l = sel.state.lifted;
			expect(l.data[(2 * 8 + 2) * 4]).toBe(200);
			expect(l.data[(2 * 8 + 3) * 4]).toBe(100);
			expect(sel.state.offset).toEqual({ x: 0, y: 0 });
		}
	});

	test("rotate-cw then rotate-ccw restores the float's pixels (identity)", () => {
		const { core, sel, layerId } = setup();
		const cel = blankPixels(8, 8);
		const i = (2 * 8 + 2) * 4;
		cel.data[i] = 150;
		cel.data[i + 3] = 255;
		core.setCel(layerId, 0, cel);
		// Even × even bounds so the bounds-centre re-centring inverts exactly.
		sel.applyRegion(rectMask(8, 8, 1, 1, 4, 2), "replace");
		sel.beginMove();
		const before =
			sel.state.kind === "floating"
				? Array.from(sel.state.lifted.data)
				: [];
		sel.rotateCw();
		sel.rotateCcw();
		if (sel.state.kind === "floating") {
			expect(Array.from(sel.state.lifted.data)).toEqual(before);
		} else {
			throw new Error("expected floating");
		}
	});

	test("no selection: transform is a no-op returning false", () => {
		const { sel } = setup();
		expect(sel.flipHorizontal()).toBe(false);
		expect(sel.rotateCw()).toBe(false);
	});

	test("committing a flipped float writes the mirrored pixels once", () => {
		const { core, sel, layerId } = setup();
		const cel = blankPixels(8, 8);
		for (const x of [2, 3]) {
			const idx = (2 * 8 + x) * 4;
			cel.data[idx] = x === 2 ? 100 : 200;
			cel.data[idx + 3] = 255;
		}
		core.setCel(layerId, 0, cel);
		sel.applyRegion(rectMask(8, 8, 2, 2, 3, 2), "replace");
		sel.flipHorizontal();
		sel.commit();
		expect(alpha(core, 2, 2)).toBe(255);
		expect(alpha(core, 3, 2)).toBe(255);
		expect(core.getCel(layerId, 0)!.data[(2 * 8 + 2) * 4]).toBe(200);
		expect(core.getCel(layerId, 0)!.data[(2 * 8 + 3) * 4]).toBe(100);
	});
});
