import { describe, expect, test } from "bun:test";
import {
	alphaLockAllows,
	eraseWithInk,
	paintWithInk,
} from "../src/editor/sprite/inks";
import type { SpriteDocument } from "../src/editor/sprite/sprite-document";

describe("alpha-lock decision", () => {
	test("allows opaque cel pixels, protects transparent ones", () => {
		expect(alphaLockAllows(255)).toBe(true);
		expect(alphaLockAllows(1)).toBe(true);
		expect(alphaLockAllows(0)).toBe(false);
	});
});

type Rec = {
	paint: Array<[number, number]>;
	erase: Array<[number, number]>;
};

/** A document stub whose only observable is the active-cel alpha map. */
const fakeDoc = (
	opaque: ReadonlySet<string>,
	rec: Rec,
): SpriteDocument =>
	({
		activeCelAlpha: (x: number, y: number) =>
			opaque.has(`${x},${y}`) ? 255 : 0,
		setPixel: (x: number, y: number) => rec.paint.push([x, y]),
		erasePixel: (x: number, y: number) => rec.erase.push([x, y]),
	}) as unknown as SpriteDocument;

describe("alpha-lock ink", () => {
	test("paint lands only where the cel is already opaque", () => {
		const rec: Rec = { paint: [], erase: [] };
		const doc = fakeDoc(new Set(["1,1"]), rec);
		paintWithInk(doc, "alpha-lock", 1, 1, "red");
		paintWithInk(doc, "alpha-lock", 2, 2, "red");
		expect(rec.paint).toEqual([[1, 1]]);
	});

	test("erase respects the same lock", () => {
		const rec: Rec = { paint: [], erase: [] };
		const doc = fakeDoc(new Set(["3,0"]), rec);
		eraseWithInk(doc, "alpha-lock", 3, 0);
		eraseWithInk(doc, "alpha-lock", 4, 0);
		expect(rec.erase).toEqual([[3, 0]]);
	});

	test("normal ink is unaffected by cel alpha", () => {
		const rec: Rec = { paint: [], erase: [] };
		const doc = fakeDoc(new Set(), rec);
		paintWithInk(doc, "normal", 5, 5, "red");
		expect(rec.paint).toEqual([[5, 5]]);
	});
});
