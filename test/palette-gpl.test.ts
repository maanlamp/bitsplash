import { describe, expect, test } from "bun:test";
import {
	parseGpl,
	serializeGpl,
} from "../src/editor/sprite/gpl-palette";
import {
	parseHex,
	serializeHex,
} from "../src/editor/sprite/hex-palette";
import {
	hexToPaletteColor,
	paletteColor,
	paletteColorToHex,
} from "../src/editor/sprite/palette-color";

describe("gpl palette", () => {
	const SAMPLE = [
		"GIMP Palette",
		"Name: Sample",
		"Columns: 4",
		"# a comment line",
		"255   0   0\tRed",
		"  0 255   0\tGreen",
		"  0   0 255\tBlue",
		"",
	].join("\n");

	test("parses name, skips comments/headers, reads RGB", () => {
		const { name, colors } = parseGpl(SAMPLE);
		expect(name).toBe("Sample");
		expect(colors).toEqual([
			paletteColor(255, 0, 0),
			paletteColor(0, 255, 0),
			paletteColor(0, 0, 255),
		]);
	});

	test("rejects a file without the magic header", () => {
		expect(() => parseGpl("255 0 0\n")).toThrow();
	});

	test("round-trips serialize → parse preserving order and name", () => {
		const colors = [
			paletteColor(18, 32, 64),
			paletteColor(200, 100, 50),
			paletteColor(255, 255, 255),
		];
		const { name, colors: back } = parseGpl(
			serializeGpl(colors, "Roundtrip"),
		);
		expect(name).toBe("Roundtrip");
		expect(back).toEqual(colors);
	});

	test("round-trips a known .gpl text unchanged through parse → serialize", () => {
		const { name, colors } = parseGpl(SAMPLE);
		const reparsed = parseGpl(serializeGpl(colors, name));
		expect(reparsed.name).toBe(name);
		expect(reparsed.colors).toEqual(colors);
	});
});

describe("hex palette (Lospec)", () => {
	test("parses one RRGGBB per line, tolerating # and blanks", () => {
		expect(parseHex("ff0000\n#00FF00\n\n0000ff\n")).toEqual([
			paletteColor(255, 0, 0),
			paletteColor(0, 255, 0),
			paletteColor(0, 0, 255),
		]);
	});

	test("skips lines that are not valid hex colours", () => {
		expect(parseHex("ff0000\nnot-a-colour\n123\n")).toEqual([
			paletteColor(255, 0, 0),
			paletteColor(17, 34, 51),
		]);
	});

	test("serialize emits lowercase rrggbb, round-trips", () => {
		const colors = [
			paletteColor(1, 2, 3),
			paletteColor(250, 200, 150),
		];
		expect(serializeHex(colors)).toBe("010203\nfac896\n");
		expect(parseHex(serializeHex(colors))).toEqual(colors);
	});
});

describe("palette colour hex", () => {
	test("hex parse handles 3-digit shorthand", () => {
		expect(hexToPaletteColor("#f00")).toEqual(
			paletteColor(255, 0, 0),
		);
		expect(hexToPaletteColor("abc")).toEqual(
			paletteColor(170, 187, 204),
		);
	});

	test("hex parse rejects malformed input", () => {
		expect(hexToPaletteColor("ggg")).toBeNull();
		expect(hexToPaletteColor("#12")).toBeNull();
	});

	test("toHex round-trips", () => {
		expect(paletteColorToHex(paletteColor(255, 128, 0))).toBe(
			"#ff8000",
		);
	});
});
