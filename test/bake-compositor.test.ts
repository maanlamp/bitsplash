import { describe, expect, test } from "bun:test";
import { compositeFrame } from "../src/editor/sprite/bake-compositor";
import { legacyBlendChannel } from "../src/editor/sprite/legacy-blend";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";

const solid = (
	r: number,
	g: number,
	b: number,
	a: number,
): PixelBuffer => ({
	width: 1,
	height: 1,
	data: new Uint8ClampedArray([r, g, b, a]),
});

const close = (actual: number, expected: number): void => {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9);
};

describe("legacyBlendChannel", () => {
	test("subtract: max(0, b - s)", () => {
		close(legacyBlendChannel("subtract", 0.8, 0.3), 0.5);
		close(legacyBlendChannel("subtract", 0.2, 0.5), 0);
	});

	test("divide: s === 0 ? 1 : min(1, b / s)", () => {
		close(legacyBlendChannel("divide", 0.5, 0), 1);
		close(legacyBlendChannel("divide", 0.25, 0.5), 0.5);
		close(legacyBlendChannel("divide", 0.9, 0.3), 1);
	});

	test("reflect: s === 1 ? 1 : min(1, b*b / (1 - s))", () => {
		close(legacyBlendChannel("reflect", 0.5, 1), 1);
		close(legacyBlendChannel("reflect", 0.4, 0.6), 0.4);
		close(legacyBlendChannel("reflect", 0.9, 0.5), 1);
	});

	test("glow: b === 1 ? 1 : min(1, s*s / (1 - b))", () => {
		close(legacyBlendChannel("glow", 1, 0.5), 1);
		close(legacyBlendChannel("glow", 0.6, 0.4), 0.4);
		close(legacyBlendChannel("glow", 0.5, 0.9), 1);
	});

	test("negation: 1 - abs(1 - b - s)", () => {
		close(legacyBlendChannel("negation", 0.5, 0.5), 1);
		close(legacyBlendChannel("negation", 0.2, 0.3), 0.5);
		close(legacyBlendChannel("negation", 0.9, 0.8), 0.3);
	});
});

describe("compositeFrame", () => {
	test("source-over stacks a top layer over the backdrop", () => {
		const bake = compositeFrame(1, 1, [
			{
				visible: true,
				opacity: 1,
				blend: "source-over",
				pixels: solid(255, 0, 0, 255),
			},
			{
				visible: true,
				opacity: 1,
				blend: "source-over",
				pixels: solid(0, 0, 255, 255),
			},
		]);
		expect([...bake.data]).toEqual([0, 0, 255, 255]);
	});

	test("a hidden or zero-opacity layer contributes nothing", () => {
		const bake = compositeFrame(1, 1, [
			{
				visible: true,
				opacity: 1,
				blend: "source-over",
				pixels: solid(255, 0, 0, 255),
			},
			{
				visible: false,
				opacity: 1,
				blend: "source-over",
				pixels: solid(0, 255, 0, 255),
			},
			{
				visible: true,
				opacity: 0,
				blend: "source-over",
				pixels: solid(0, 0, 255, 255),
			},
		]);
		expect([...bake.data]).toEqual([255, 0, 0, 255]);
	});

	test("a subtract layer applies the legacy per-channel formula on opaque pixels", () => {
		const bake = compositeFrame(1, 1, [
			{
				visible: true,
				opacity: 1,
				blend: "source-over",
				pixels: solid(200, 100, 50, 255),
			},
			{
				visible: true,
				opacity: 1,
				blend: "subtract",
				pixels: solid(50, 100, 50, 255),
			},
		]);
		expect([...bake.data]).toEqual([150, 0, 0, 255]);
	});

	test("a transparent legacy layer leaves the backdrop untouched", () => {
		const bake = compositeFrame(1, 1, [
			{
				visible: true,
				opacity: 1,
				blend: "source-over",
				pixels: solid(120, 60, 30, 255),
			},
			{
				visible: true,
				opacity: 1,
				blend: "divide",
				pixels: solid(0, 0, 0, 0),
			},
		]);
		expect([...bake.data]).toEqual([120, 60, 30, 255]);
	});

	test("throws when a native blend is used without a canvas compositor", () => {
		expect(() =>
			compositeFrame(1, 1, [
				{
					visible: true,
					opacity: 1,
					blend: "multiply",
					pixels: solid(255, 255, 255, 255),
				},
			]),
		).toThrow(/native blend/i);
	});

	test("delegates native blends to the injected compositor", () => {
		const seen: string[] = [];
		const bake = compositeFrame(
			1,
			1,
			[
				{
					visible: true,
					opacity: 1,
					blend: "source-over",
					pixels: solid(10, 20, 30, 255),
				},
				{
					visible: true,
					opacity: 0.5,
					blend: "multiply",
					pixels: solid(0, 0, 0, 255),
				},
			],
			(_backdrop, _source, opacity, blend) => {
				seen.push(`${blend}@${opacity}`);
				return solid(1, 2, 3, 255);
			},
		);
		expect(seen).toEqual(["multiply@0.5"]);
		expect([...bake.data]).toEqual([1, 2, 3, 255]);
	});
});
