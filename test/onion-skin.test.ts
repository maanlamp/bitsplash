import { describe, expect, test } from "bun:test";
import {
	DEFAULT_ONION,
	type OnionSettings,
	onionGhosts,
	tintPixels,
} from "../src/editor/sprite/onion-skin";
import { blankPixels } from "../src/editor/sprite/pixel-buffer";

const solid = (r: number, g: number, b: number, a: number) => {
	const buf = blankPixels(1, 1);
	buf.data.set([r, g, b, a]);
	return buf;
};

const on = (patch: Partial<OnionSettings>): OnionSettings => ({
	...DEFAULT_ONION,
	enabled: true,
	...patch,
});

describe("onionGhosts", () => {
	test("disabled onion yields no ghosts", () => {
		expect(onionGhosts(2, 5, DEFAULT_ONION)).toEqual([]);
	});

	test("selects prev/next neighbours with side tints", () => {
		const ghosts = onionGhosts(
			2,
			5,
			on({ prevCount: 1, nextCount: 1, opacity: 0.5, falloff: 0.5 }),
		);
		expect(ghosts).toEqual([
			{ frame: 1, opacity: 0.5, tint: DEFAULT_ONION.prevTint },
			{ frame: 3, opacity: 0.5, tint: DEFAULT_ONION.nextTint },
		]);
	});

	test("opacity falls off with distance", () => {
		const ghosts = onionGhosts(
			3,
			7,
			on({ prevCount: 2, nextCount: 0, opacity: 0.8, falloff: 0.5 }),
		);
		expect(ghosts.map((g) => [g.frame, g.opacity])).toEqual([
			[2, 0.8],
			[1, 0.4],
		]);
	});

	test("clamps to existing frames without wrapping at the start", () => {
		const ghosts = onionGhosts(
			0,
			3,
			on({ prevCount: 2, nextCount: 2 }),
		);
		expect(ghosts.map((g) => g.frame)).toEqual([1, 2]);
	});

	test("clamps at the end", () => {
		const ghosts = onionGhosts(
			2,
			3,
			on({ prevCount: 2, nextCount: 2 }),
		);
		expect(ghosts.map((g) => g.frame)).toEqual([1, 0]);
	});

	test("no ghosts when there are no frames", () => {
		expect(onionGhosts(0, 0, on({}))).toEqual([]);
	});
});

describe("tintPixels", () => {
	test("full strength replaces colour with the tint, keeping alpha", () => {
		const out = tintPixels(solid(10, 20, 30, 200), [255, 0, 0], 1);
		expect([...out.data]).toEqual([255, 0, 0, 200]);
	});

	test("zero strength leaves colour untouched", () => {
		const out = tintPixels(solid(10, 20, 30, 128), [255, 0, 0], 0);
		expect([...out.data]).toEqual([10, 20, 30, 128]);
	});

	test("half strength lerps halfway toward the tint", () => {
		const out = tintPixels(solid(0, 0, 0, 255), [200, 100, 50], 0.5);
		expect([...out.data]).toEqual([100, 50, 25, 255]);
	});

	test("transparent pixels stay fully transparent", () => {
		const out = tintPixels(solid(10, 20, 30, 0), [255, 0, 0], 1);
		expect([...out.data]).toEqual([0, 0, 0, 0]);
	});

	test("does not mutate the source buffer", () => {
		const src = solid(10, 20, 30, 255);
		tintPixels(src, [255, 0, 0], 1);
		expect([...src.data]).toEqual([10, 20, 30, 255]);
	});
});
