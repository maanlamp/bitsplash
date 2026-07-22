import { describe, expect, test } from "bun:test";
import { paintWithInk } from "../src/editor/sprite/inks";
import { paletteColor } from "../src/editor/sprite/palette-color";
import { spritePalette } from "../src/editor/sprite/palette-state";
import type { SpriteDocument } from "../src/editor/sprite/sprite-document";

type Rgba = [number, number, number, number];

/** A doc stub exposing an active-cel colour map and recording painted CSS. */
const fakeDoc = (
	cel: ReadonlyMap<string, Rgba>,
	painted: Array<[number, number, string]>,
): SpriteDocument =>
	({
		activeCelColorAt: (x: number, y: number) =>
			cel.get(`${x},${y}`) ?? null,
		setPixel: (x: number, y: number, css: string) =>
			painted.push([x, y, css]),
	}) as unknown as SpriteDocument;

const DARK = paletteColor(20, 20, 20);
const MID = paletteColor(120, 120, 120);
const LIGHT = paletteColor(230, 230, 230);

describe("shading ink", () => {
	test("shifts an on-palette opaque pixel to the next ramp colour", () => {
		spritePalette.replace([DARK, MID, LIGHT]);
		const painted: Array<[number, number, string]> = [];
		const doc = fakeDoc(
			new Map([["1,1", [20, 20, 20, 255]]]),
			painted,
		);
		paintWithInk(doc, "shading", 1, 1, "ignored");
		expect(painted).toEqual([[1, 1, "rgb(120 120 120)"]]);
	});

	test("leaves off-palette and non-opaque pixels untouched", () => {
		spritePalette.replace([DARK, MID, LIGHT]);
		const painted: Array<[number, number, string]> = [];
		const doc = fakeDoc(
			new Map<string, Rgba>([
				["0,0", [99, 99, 99, 255]], // off-palette
				["1,0", [20, 20, 20, 128]], // on-palette but semi-transparent
				["2,0", [230, 230, 230, 255]], // ramp end → stop
			]),
			painted,
		);
		paintWithInk(doc, "shading", 0, 0, "x");
		paintWithInk(doc, "shading", 1, 0, "x");
		paintWithInk(doc, "shading", 2, 0, "x");
		expect(painted).toEqual([]);
	});
});
