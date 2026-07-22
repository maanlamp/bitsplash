import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { UnsupportedImportError } from "../src/editor/sprite/import-policy";
import { importOra, parseOra } from "../src/editor/sprite/ora-import";
import { encodePng } from "../src/editor/sprite/png-codec";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";

/** A solid-color layer image of the given size (straight-alpha RGBA). */
const solid = (
	width: number,
	height: number,
	r: number,
	g: number,
	b: number,
	a: number,
): PixelBuffer => {
	const buf = blankPixels(width, height);
	for (let i = 0; i < width * height; i++) {
		buf.data[i * 4] = r;
		buf.data[i * 4 + 1] = g;
		buf.data[i * 4 + 2] = b;
		buf.data[i * 4 + 3] = a;
	}
	return buf;
};

/**
 * Build a synthetic `.ora` archive: `stack.xml` describing `layers` (given
 * top→bottom, as ORA stores them) plus one PNG per layer and a mergedimage.
 * No real ORA sample exists in the repo, so the importer is exercised against
 * this hand-built minimal file.
 */
const buildOra = (
	width: number,
	height: number,
	layers: ReadonlyArray<{
		name: string;
		src: string;
		compositeOp?: string;
		opacity?: number;
		visibility?: "visible" | "hidden";
		x?: number;
		y?: number;
		pixels: PixelBuffer;
	}>,
): Uint8Array => {
	const layerXml = layers
		.map(
			(l) =>
				`<layer name="${l.name}" src="${l.src}"` +
				` composite-op="${l.compositeOp ?? "svg:src-over"}"` +
				` opacity="${l.opacity ?? 1}"` +
				` visibility="${l.visibility ?? "visible"}"` +
				` x="${l.x ?? 0}" y="${l.y ?? 0}"/>`,
		)
		.join("\n");
	const xml =
		`<?xml version='1.0' encoding='UTF-8'?>\n` +
		`<image version="0.0.3" w="${width}" h="${height}">\n` +
		`<stack name="root" opacity="1" composite-op="svg:src-over">\n` +
		`${layerXml}\n</stack>\n</image>`;

	const entries: Record<string, Uint8Array> = {
		mimetype: strToU8("image/openraster"),
		"stack.xml": strToU8(xml),
		"mergedimage.png": encodePng(solid(width, height, 0, 0, 0, 0)),
	};
	for (const l of layers) {
		entries[l.src] = encodePng(l.pixels);
	}
	return zipSync(entries);
};

describe("parseOra — synthetic OpenRaster archive", () => {
	test("dims, layer order (reversed to bottom→top), names, visibility, blend, pixels", () => {
		// stack.xml order (top→bottom): top red, bottom green.
		const ora = buildOra(4, 3, [
			{
				name: "top",
				src: "data/layer0.png",
				compositeOp: "svg:multiply",
				opacity: 0.5,
				visibility: "hidden",
				pixels: solid(4, 3, 255, 0, 0, 255),
			},
			{
				name: "bottom",
				src: "data/layer1.png",
				pixels: solid(4, 3, 0, 255, 0, 255),
			},
		]);
		const doc = parseOra(ora);
		expect(doc.width).toBe(4);
		expect(doc.height).toBe(3);
		// Reversed to bottom→top: index 0 is "bottom".
		expect(doc.layers.map((l) => l.name)).toEqual(["bottom", "top"]);

		const [bottom, top] = doc.layers;
		expect(bottom!.blend).toBe("source-over");
		expect(bottom!.visible).toBe(true);
		expect(bottom!.opacity).toBe(1);
		// Green fill decoded.
		expect(Array.from(bottom!.pixels.data.subarray(0, 4))).toEqual([
			0, 255, 0, 255,
		]);

		expect(top!.blend).toBe("multiply");
		expect(top!.visible).toBe(false);
		expect(top!.opacity).toBe(0.5);
		expect(Array.from(top!.pixels.data.subarray(0, 4))).toEqual([
			255, 0, 0, 255,
		]);
	});

	test("a layer x/y offset places the image into the full canvas", () => {
		const ora = buildOra(4, 4, [
			{
				name: "dot",
				src: "data/layer0.png",
				x: 1,
				y: 2,
				pixels: solid(1, 1, 10, 20, 30, 255),
			},
		]);
		const doc = parseOra(ora);
		const { pixels } = doc.layers[0]!;
		expect(pixels.width).toBe(4);
		expect(pixels.height).toBe(4);
		// The single source pixel lands at (x=1, y=2).
		const at = (2 * 4 + 1) * 4;
		expect(Array.from(pixels.data.subarray(at, at + 4))).toEqual([
			10, 20, 30, 255,
		]);
		// Origin stays transparent.
		expect(Array.from(pixels.data.subarray(0, 4))).toEqual([
			0, 0, 0, 0,
		]);
	});

	test("importOra yields a one-frame description, one cel per layer", () => {
		const ora = buildOra(2, 2, [
			{
				name: "a",
				src: "data/layer0.png",
				pixels: solid(2, 2, 1, 1, 1, 255),
			},
			{
				name: "b",
				src: "data/layer1.png",
				pixels: solid(2, 2, 2, 2, 2, 255),
			},
		]);
		const desc = importOra(ora);
		expect(desc.frames.length).toBe(1);
		expect(desc.layers.length).toBe(2);
		expect(desc.cels.length).toBe(2);
		expect(new Set(desc.layers.map((l) => l.id)).size).toBe(2);
		for (const cel of desc.cels) {
			expect(cel.frameIndex).toBe(0);
		}
	});
});

describe("parseOra — import refusal", () => {
	test("an unmappable composite-op refuses and names the layer", () => {
		const ora = buildOra(2, 2, [
			{
				name: "sparkle",
				src: "data/layer0.png",
				compositeOp: "krita:tangent_normalmap",
				pixels: solid(2, 2, 9, 9, 9, 255),
			},
		]);
		let error: unknown;
		try {
			parseOra(ora);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(UnsupportedImportError);
		const message = (error as Error).message;
		expect(message).toContain('Layer "sparkle"');
		expect(message).toContain("krita:tangent_normalmap");
		expect(message).toContain(".ora");
	});
});
