import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
	UnsupportedImportError,
	refuseIfUnsupported,
} from "../src/editor/sprite/import-policy";
import {
	importPdn,
	parsePdn,
	pdnToBsprite,
} from "../src/editor/sprite/pdn-import";
import type { PixelBuffer } from "../src/editor/sprite/pixel-buffer";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";

const load = (name: string): Uint8Array => {
	const b = readFileSync(
		`${import.meta.dir}/../src/game/content/assets/${name}.pdn`,
	);
	return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
};

const nonTransparent = (pixels: PixelBuffer): number => {
	let count = 0;
	for (let i = 3; i < pixels.data.length; i += 4) {
		if (pixels.data[i] !== 0) {
			count++;
		}
	}
	return count;
};

describe("parsePdn — real repository files", () => {
	test("tree.pdn: dims, layers, names, blends, non-empty surfaces", () => {
		const doc = parsePdn(load("tree"));
		expect(doc.width).toBe(96);
		expect(doc.height).toBe(96);
		expect(doc.layers.map((l) => l.name)).toEqual([
			"bg",
			"Leaves bg",
			"tree",
			"leaves mg",
			"leaves fg",
			"leaves highlights",
		]);
		for (const layer of doc.layers) {
			expect(layer.blend).toBe("source-over");
			expect(layer.visible).toBe(true);
			expect(layer.opacity).toBe(1);
			expect(layer.pixels.width).toBe(96);
			expect(layer.pixels.height).toBe(96);
			expect(nonTransparent(layer.pixels)).toBeGreaterThan(0);
		}
		// The "bg" sky layer is a fully opaque fill; a foreground detail layer
		// is sparse — proving the surface decode is not a uniform smear.
		expect(nonTransparent(doc.layers[0]!.pixels)).toBe(96 * 96);
		expect(nonTransparent(doc.layers[5]!.pixels)).toBeLessThan(
			96 * 96,
		);
	});

	test("birch.pdn: dims, layers, names, non-empty surfaces", () => {
		const doc = parsePdn(load("birch"));
		expect(doc.width).toBe(160);
		expect(doc.height).toBe(256);
		expect(doc.layers.map((l) => l.name)).toEqual([
			"FOLIAGE BG",
			"TREE",
			"FOLIAGE FG",
			"FOLIAGE HILIGHT",
		]);
		for (const layer of doc.layers) {
			expect(layer.blend).toBe("source-over");
			expect(layer.pixels.width).toBe(160);
			expect(layer.pixels.height).toBe(256);
			expect(nonTransparent(layer.pixels)).toBeGreaterThan(0);
		}
	});
});

describe("pdnToDescription / pdnToBsprite", () => {
	test("importPdn yields a single-frame description, one cel per layer", () => {
		const desc = importPdn(load("tree"));
		expect(desc.frames.length).toBe(1);
		expect(desc.layers.length).toBe(6);
		expect(desc.cels.length).toBe(6);
		expect(desc.tags).toEqual([]);
		expect(new Set(desc.layers.map((l) => l.id)).size).toBe(6);
		for (const cel of desc.cels) {
			expect(cel.frameIndex).toBe(0);
		}
	});

	test("pdnToBsprite round-trips dims, layer names and blends through the manifest", () => {
		const bytes = pdnToBsprite(load("birch"));
		const manifest = readBspriteManifest(bytes);
		expect(manifest.width).toBe(160);
		expect(manifest.height).toBe(256);
		expect(manifest.layers.map((l) => l.name)).toEqual([
			"FOLIAGE BG",
			"TREE",
			"FOLIAGE FG",
			"FOLIAGE HILIGHT",
		]);
		for (const layer of manifest.layers) {
			expect(layer.blend).toBe("source-over");
		}
		expect(manifest.frames.length).toBe(1);
	});
});

describe("import-refusal policy", () => {
	test("refuseIfUnsupported is a no-op when nothing is unsupported", () => {
		expect(() => refuseIfUnsupported(".pdn", [])).not.toThrow();
	});

	test("refuseIfUnsupported names every offending layer and feature", () => {
		let error: unknown;
		try {
			refuseIfUnsupported(".pdn", [
				{ where: 'Layer "fx"', what: 'the "Xor" blend mode' },
				{ where: 'Layer "scan"', what: "a 24-bit surface" },
			]);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(UnsupportedImportError);
		const message = (error as Error).message;
		expect(message).toContain('Layer "fx"');
		expect(message).toContain('"Xor"');
		expect(message).toContain('Layer "scan"');
		expect(message).toContain("24-bit");
		expect(message).toContain(".pdn");
		expect((error as UnsupportedImportError).features.length).toBe(2);
	});
});
