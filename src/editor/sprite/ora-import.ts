import { unzipSync } from "fflate";
import type { BlendId } from "../../engine/sprite/bsprite-manifest";
import { type CelInput, serializeBsprite } from "./bsprite-writer";
import type { CelStoreDescription } from "./cel-store";
import { DEFAULT_FRAME_DURATION_MS } from "./cel-store";
import {
	type UnsupportedFeature,
	refuseIfUnsupported,
} from "./import-policy";
import { decodePng } from "./png-codec";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * A layer parsed from an `.ora` (OpenRaster) file, already reordered to
 * bottom→top (index 0 painted first) — the same order `.bsprite` uses, and the
 * reverse of ORA's own top→bottom `stack.xml` order. `opacity` is normalized to
 * `0..1`; `blend` is mapped to a {@link BlendId}; `pixels` is the layer image
 * composited into a full-canvas surface at its `x`/`y` offset, in straight
 * (non-premultiplied) RGBA.
 */
export type OraLayer = Readonly<{
	name: string;
	opacity: number;
	visible: boolean;
	blend: BlendId;
	pixels: PixelBuffer;
}>;

/**
 * The intermediate parse of one `.ora` file — canvas size and layers
 * (bottom→top). OpenRaster is a single still image, so there are no frames or
 * tags here; {@link oraToDescription} turns this into a one-frame
 * {@link CelStoreDescription} (one cel per layer).
 */
export type OraDocument = Readonly<{
	width: number;
	height: number;
	layers: readonly OraLayer[];
}>;

const FORMAT = ".ora";
const STACK_ENTRY = "stack.xml";

/**
 * OpenRaster `composite-op` → {@link BlendId}. OpenRaster names blend modes with
 * the SVG compositing/blending identifiers; the sixteen W3C separable/
 * non-separable modes map straight through, and `svg:plus` (additive) →
 * `lighter`. ORA has no equivalent for our paint.NET-only legacy math modes, and
 * anything outside this table (e.g. a Krita-specific `krita:*` op) is an import
 * refusal — no silent flatten.
 */
const ORA_BLEND: Readonly<Record<string, BlendId>> = {
	"svg:src-over": "source-over",
	"svg:multiply": "multiply",
	"svg:screen": "screen",
	"svg:overlay": "overlay",
	"svg:darken": "darken",
	"svg:lighten": "lighten",
	"svg:color-dodge": "color-dodge",
	"svg:color-burn": "color-burn",
	"svg:hard-light": "hard-light",
	"svg:soft-light": "soft-light",
	"svg:difference": "difference",
	"svg:color": "color",
	"svg:luminosity": "luminosity",
	"svg:hue": "hue",
	"svg:saturation": "saturation",
	"svg:exclusion": "exclusion",
	"svg:plus": "lighter",
};

const DEFAULT_COMPOSITE = "svg:src-over";

/**
 * Parse the attributes of a single XML start tag into a name→value map. Handles
 * both `"`- and `'`-quoted values and namespaced names (`composite-op`,
 * `svg:src-over`). Sufficient for OpenRaster's flat, attribute-only
 * `stack.xml` — no entity decoding or nested-content handling.
 */
const tagAttrs = (tag: string): Record<string, string> => {
	const attrs: Record<string, string> = {};
	const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(tag)) !== null) {
		attrs[m[1]!] = m[2] ?? m[3] ?? "";
	}
	return attrs;
};

const intAttr = (
	attrs: Record<string, string>,
	name: string,
	fallback: number,
): number => {
	const raw = attrs[name];
	if (raw === undefined) {
		return fallback;
	}
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : fallback;
};

const floatAttr = (
	attrs: Record<string, string>,
	name: string,
	fallback: number,
): number => {
	const raw = attrs[name];
	if (raw === undefined) {
		return fallback;
	}
	const value = Number.parseFloat(raw);
	return Number.isFinite(value) ? value : fallback;
};

/**
 * Blit a full-decoded layer {@link PixelBuffer} into a fresh canvas-sized buffer
 * at offset (`x`,`y`), clipping to the canvas bounds. OpenRaster layer images may
 * be smaller than the canvas (or offset off-edge); pixels outside the canvas are
 * dropped and unwritten canvas pixels stay transparent.
 */
const placeLayer = (
	layer: PixelBuffer,
	x: number,
	y: number,
	canvasW: number,
	canvasH: number,
): PixelBuffer => {
	const out = blankPixels(canvasW, canvasH);
	for (let sy = 0; sy < layer.height; sy++) {
		const dy = y + sy;
		if (dy < 0 || dy >= canvasH) {
			continue;
		}
		for (let sx = 0; sx < layer.width; sx++) {
			const dx = x + sx;
			if (dx < 0 || dx >= canvasW) {
				continue;
			}
			const si = (sy * layer.width + sx) * 4;
			const di = (dy * canvasW + dx) * 4;
			out.data[di] = layer.data[si]!;
			out.data[di + 1] = layer.data[si + 1]!;
			out.data[di + 2] = layer.data[si + 2]!;
			out.data[di + 3] = layer.data[si + 3]!;
		}
	}
	return out;
};

/**
 * Parse an `.ora` (OpenRaster) file into an {@link OraDocument}: unzip the
 * archive, parse `stack.xml` for the canvas size and layer stack (name, opacity,
 * visibility, composite-op, `x`/`y` offset, `src`), and decode each layer's PNG
 * into a full-canvas {@link PixelBuffer}. Layers are reversed from ORA's
 * top→bottom order to `.bsprite`'s bottom→top order. Hidden layers are kept with
 * `visible: false` — never dropped. Pure and DOM-free (unzip + `decodePng`), so
 * it runs headlessly.
 *
 * A nested layer group (`<stack>` inside the root) or an unmappable
 * `composite-op` is **refused** per the shared import policy with an error
 * naming every offending layer — no silent flatten, no partial import.
 *
 * @throws if the bytes are not a valid `.ora` archive (no `stack.xml`, no
 * `<image>` element, or a layer references a missing `src`), or
 * {@link import("./import-policy").UnsupportedImportError} when the file uses
 * features `.bsprite` cannot represent.
 */
export const parseOra = (bytes: Uint8Array): OraDocument => {
	const entries = unzipSync(bytes);
	const stackBytes = entries[STACK_ENTRY];
	if (!stackBytes) {
		throw new Error(`Not an .ora file (missing ${STACK_ENTRY}).`);
	}
	const xml = new TextDecoder().decode(stackBytes);

	const imageTag = /<image\b[^>]*>/.exec(xml);
	if (!imageTag) {
		throw new Error(
			"Malformed .ora: stack.xml has no <image> element.",
		);
	}
	const imageAttrs = tagAttrs(imageTag[0]);
	const width = intAttr(imageAttrs, "w", 0);
	const height = intAttr(imageAttrs, "h", 0);
	if (width <= 0 || height <= 0) {
		throw new Error("Malformed .ora: <image> has no positive w/h.");
	}

	const unsupported: UnsupportedFeature[] = [];

	// A second <stack> beyond the root is a layer group, which .bsprite's flat
	// layer list cannot represent.
	const stacks = xml.match(/<stack\b[^>]*>/g) ?? [];
	for (const stack of stacks.slice(1)) {
		const name = tagAttrs(stack).name ?? "(unnamed)";
		unsupported.push({
			where: `Group "${name}"`,
			what: "a nested layer group",
		});
	}

	type Pending = Readonly<{
		name: string;
		opacity: number;
		visible: boolean;
		blend: BlendId;
		src: string;
		x: number;
		y: number;
	}>;
	const pending: Pending[] = [];

	const layerRe = /<layer\b[^>]*?\/?>/g;
	let m: RegExpExecArray | null;
	let index = 0;
	while ((m = layerRe.exec(xml)) !== null) {
		const attrs = tagAttrs(m[0]);
		const name = attrs.name ?? `Layer ${index}`;
		const quoted = `Layer "${name}"`;
		const compositeOp = attrs["composite-op"] ?? DEFAULT_COMPOSITE;
		const blend = ORA_BLEND[compositeOp];
		if (blend === undefined) {
			unsupported.push({
				where: quoted,
				what: `the "${compositeOp}" composite mode`,
			});
		}
		const src = attrs.src;
		if (src === undefined) {
			throw new Error(`Malformed .ora: ${quoted} has no src.`);
		}
		pending.push({
			name,
			opacity: floatAttr(attrs, "opacity", 1),
			visible: attrs.visibility !== "hidden",
			blend: blend ?? "source-over",
			src,
			x: intAttr(attrs, "x", 0),
			y: intAttr(attrs, "y", 0),
		});
		index += 1;
	}

	// Only after refusal checks pass do we spend work decoding layer PNGs.
	refuseIfUnsupported(FORMAT, unsupported);

	// stack.xml lists layers top→bottom; .bsprite is bottom→top.
	const ordered = pending.slice().toReversed();
	const layers: OraLayer[] = ordered.map((entry) => {
		const png = entries[entry.src];
		if (!png) {
			throw new Error(
				`Malformed .ora: layer image "${entry.src}" is missing from the archive.`,
			);
		}
		return {
			name: entry.name,
			opacity: entry.opacity,
			visible: entry.visible,
			blend: entry.blend,
			pixels: placeLayer(
				decodePng(png),
				entry.x,
				entry.y,
				width,
				height,
			),
		};
	});

	return { width, height, layers };
};

/** A stable, deterministic layer id for the id-less {@link OraLayer}. */
const layerId = (index: number): string => `layer-${index}`;

/**
 * Map a parsed {@link OraDocument} to a single-frame {@link CelStoreDescription}
 * — one layer per OpenRaster layer, one cel each on frame 0 — ready for
 * `SpriteDocument.fromDescription` or {@link serializeBsprite}.
 */
export const oraToDescription = (
	doc: OraDocument,
): CelStoreDescription => {
	const layers = doc.layers.map((layer, index) => ({
		id: layerId(index),
		name: layer.name,
		opacity: layer.opacity,
		visible: layer.visible,
		blend: layer.blend,
	}));
	const cels: CelInput[] = doc.layers.map((layer, index) => ({
		layerId: layerId(index),
		frameIndex: 0,
		pixels: layer.pixels,
	}));
	return {
		width: doc.width,
		height: doc.height,
		layers,
		frames: [{ duration: DEFAULT_FRAME_DURATION_MS }],
		cels,
		tags: [],
	};
};

/**
 * Convenience: parse `.ora` bytes into a serializable
 * {@link CelStoreDescription} in one call ({@link parseOra} →
 * {@link oraToDescription}). Feed the result to
 * `SpriteDocument.fromDescription` to build an editor document.
 */
export const importOra = (bytes: Uint8Array): CelStoreDescription =>
	oraToDescription(parseOra(bytes));

/**
 * Convenience: parse `.ora` bytes and serialize straight to `.bsprite` archive
 * bytes ({@link importOra} → {@link serializeBsprite}). Pure and headless for
 * files with representable composite modes, so it needs no canvas compositor.
 */
export const oraToBsprite = (bytes: Uint8Array): Uint8Array =>
	serializeBsprite(importOra(bytes));
