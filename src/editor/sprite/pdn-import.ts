import { gunzipSync } from "fflate";
import type { BlendId } from "../../engine/sprite/bsprite-manifest";
import {
	type CelInput,
	type DocumentSnapshot,
	serializeBsprite,
} from "./bsprite-writer";
import type { CelStoreDescription } from "./cel-store";
import { DEFAULT_FRAME_DURATION_MS } from "./cel-store";
import {
	type UnsupportedFeature,
	refuseIfUnsupported,
} from "./import-policy";
import {
	type NrbfObject,
	type NrbfValue,
	readNrbf,
} from "./nrbf-reader";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * A layer parsed from a `.pdn` file, in paint.NET's list order (index 0 is the
 * bottom layer) — the same bottom→top order `.bsprite` uses. `opacity` is
 * normalized to `0..1`; `blend` is already mapped to a {@link BlendId}; `pixels`
 * is the full-canvas BGRA→RGBA surface in straight (non-premultiplied) alpha.
 */
export type PdnLayer = Readonly<{
	name: string;
	opacity: number;
	visible: boolean;
	blend: BlendId;
	pixels: PixelBuffer;
}>;

/**
 * The intermediate parse of one `.pdn` file — canvas size and layers
 * (bottom→top). A `.pdn` is always a single still frame, so there are no frames
 * or tags here; {@link pdnToDescription} turns this into a one-frame
 * {@link CelStoreDescription} (one cel per layer).
 */
export type PdnDocument = Readonly<{
	width: number;
	height: number;
	layers: readonly PdnLayer[];
}>;

const MAGIC = "PDN3";
const FORMAT = ".pdn";

/**
 * paint.NET `UserBlendOps` nested-class name (the part before `BlendOp`) →
 * {@link BlendId}. paint.NET's fourteen layer blend ops map onto our set with no
 * loss except `Xor`, which has no canvas or legacy equivalent and is therefore
 * an import refusal. `Reflect`/`Glow`/`Negation` are the paint.NET-only legacy
 * pixel-math modes our {@link BlendId} carries for exactly this parity.
 */
const PDN_BLEND: Readonly<Record<string, BlendId>> = {
	Normal: "source-over",
	Multiply: "multiply",
	Additive: "lighter",
	ColorBurn: "color-burn",
	ColorDodge: "color-dodge",
	Reflect: "reflect",
	Glow: "glow",
	Overlay: "overlay",
	Difference: "difference",
	Negation: "negation",
	Lighten: "lighten",
	Darken: "darken",
	Screen: "screen",
};

const asObject = (value: NrbfValue, what: string): NrbfObject => {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value)
	) {
		throw new Error(
			`Malformed .pdn: expected ${what} to be an object.`,
		);
	}
	return value;
};

const member = (
	obj: NrbfObject,
	name: string,
	what: string,
): NrbfValue => {
	if (!(name in obj.members)) {
		throw new Error(`Malformed .pdn: ${what} is missing "${name}".`);
	}
	return obj.members[name]!;
};

const str = (value: NrbfValue, fallback: string): string =>
	typeof value === "string" ? value : fallback;

const num = (value: NrbfValue, what: string): number => {
	const n = typeof value === "bigint" ? Number(value) : value;
	if (typeof n !== "number") {
		throw new Error(
			`Malformed .pdn: expected ${what} to be a number.`,
		);
	}
	return n;
};

/** Extract the blend name from a `PaintDotNet.UserBlendOps+<Name>BlendOp` class. */
const blendOpName = (className: string): string => {
	const plus = className.lastIndexOf("+");
	const short = plus >= 0 ? className.slice(plus + 1) : className;
	return short.endsWith("BlendOp")
		? short.slice(0, -"BlendOp".length)
		: short;
};

/**
 * Decode one paint.NET deferred surface block at `offset` into a straight-alpha
 * RGBA {@link PixelBuffer}, returning the buffer and the offset just past the
 * block. The block is `formatVersion` (1 byte; `0` = gzip, `1` = raw) +
 * `chunkSize` (uint32 BE), then `ceil(length / chunkSize)` chunks of
 * `chunkNumber` (uint32 BE) + `dataSize` (uint32 BE) + payload. All multi-byte
 * integers in this paint.NET-authored block are **big-endian** (unlike the
 * little-endian NRBF stream). Source bytes are BGRA at `stride` bytes/row; the
 * blue/red channels are swapped to produce RGBA.
 */
const decodeSurface = (
	bytes: Uint8Array,
	offset: number,
	width: number,
	height: number,
	stride: number,
	length: number,
): { pixels: PixelBuffer; next: number } => {
	const view = new DataView(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength,
	);
	let pos = offset;
	const formatVersion = bytes[pos];
	pos += 1;
	const chunkSize = view.getUint32(pos);
	pos += 4;
	const chunkCount = Math.ceil(length / chunkSize);
	const surface = new Uint8Array(length);
	for (let i = 0; i < chunkCount; i++) {
		const chunkNumber = view.getUint32(pos);
		pos += 4;
		const dataSize = view.getUint32(pos);
		pos += 4;
		const raw = bytes.subarray(pos, pos + dataSize);
		pos += dataSize;
		const chunkOffset = chunkNumber * chunkSize;
		const chunk = formatVersion === 0 ? gunzipSync(raw) : raw;
		surface.set(chunk, chunkOffset);
	}

	const out = blankPixels(width, height);
	for (let y = 0; y < height; y++) {
		const row = y * stride;
		for (let x = 0; x < width; x++) {
			const si = row + x * 4;
			const di = (y * width + x) * 4;
			out.data[di] = surface[si + 2]!;
			out.data[di + 1] = surface[si + 1]!;
			out.data[di + 2] = surface[si]!;
			out.data[di + 3] = surface[si + 3]!;
		}
	}
	return { pixels: out, next: pos };
};

/**
 * Parse a `.pdn` (paint.NET) file into a {@link PdnDocument}: the `PDN3` header
 * (canvas size), the NRBF-serialized `Document` graph (layer list, per-layer
 * name/visibility/opacity/blend), and each layer's gzip-compressed BGRA surface
 * (appended after the NRBF stream as paint.NET deferred data). Hidden layers are
 * kept with `visible: false` — never dropped. Pure and DOM-free (gzip via
 * `fflate`), so it runs headlessly.
 *
 * A layer that is not a bitmap layer, a non-32-bit surface, or an unmappable
 * blend mode (`Xor`) is **refused** per the shared import policy with an error
 * naming every offending layer — no silent flatten, no partial import.
 *
 * @throws if the bytes are not a `.pdn` file, or {@link UnsupportedImportError}
 * when the file uses features `.bsprite` cannot represent.
 */
export const parsePdn = (bytes: Uint8Array): PdnDocument => {
	if (
		bytes.length < 7 ||
		String.fromCharCode(
			bytes[0]!,
			bytes[1]!,
			bytes[2]!,
			bytes[3]!,
		) !== MAGIC
	) {
		throw new Error("Not a .pdn file (bad PDN3 magic).");
	}
	const headerLen = bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16);
	// After the XML header, paint.NET writes a 2-byte framing marker (`00 01`)
	// before the standard NRBF SerializationHeaderRecord.
	const nrbfStart = 7 + headerLen + 2;
	const { root, end } = readNrbf(bytes, nrbfStart);

	const canvasWidth = num(member(root, "width", "Document"), "width");
	const canvasHeight = num(
		member(root, "height", "Document"),
		"height",
	);

	const layerList = asObject(
		member(root, "layers", "Document"),
		"Document.layers",
	);
	const items = member(layerList, "ArrayList+_items", "LayerList");
	if (!Array.isArray(items)) {
		throw new Error("Malformed .pdn: layer list is not an array.");
	}
	const size = num(
		member(layerList, "ArrayList+_size", "LayerList"),
		"layer count",
	);

	const unsupported: UnsupportedFeature[] = [];
	type Pending = Readonly<{
		layer: PdnLayer;
		surface: NrbfObject | null;
	}>;
	const pending: Pending[] = [];

	for (let i = 0; i < size; i++) {
		const raw = items[i];
		const bitmap = asObject(raw ?? null, `layer ${i}`);
		const props = asObject(
			member(bitmap, "Layer+properties", `layer ${i}`),
			`layer ${i} properties`,
		);
		const name = str(
			member(props, "name", `layer ${i}`),
			`Layer ${i}`,
		);
		const quoted = `Layer "${name}"`;
		const visible = member(props, "visible", quoted) === true;
		const opacity =
			num(member(props, "opacity", quoted), "opacity") / 255;

		if (bitmap.__class !== "PaintDotNet.BitmapLayer") {
			unsupported.push({
				where: quoted,
				what: `an unsupported layer type (${bitmap.__class})`,
			});
			pending.push({
				layer: {
					name,
					opacity,
					visible,
					blend: "source-over",
					pixels: blankPixels(1, 1),
				},
				surface: null,
			});
			continue;
		}

		const blendOp = asObject(
			member(
				asObject(
					member(bitmap, "properties", quoted),
					`${quoted} properties`,
				),
				"blendOp",
				quoted,
			),
			`${quoted} blendOp`,
		);
		const pdnName = blendOpName(blendOp.__class);
		const blend = PDN_BLEND[pdnName];
		if (blend === undefined) {
			unsupported.push({
				where: quoted,
				what: `the "${pdnName}" blend mode`,
			});
		}

		const surface = asObject(
			member(bitmap, "surface", quoted),
			`${quoted} surface`,
		);
		const sWidth = num(
			member(surface, "width", quoted),
			"surface width",
		);
		const sHeight = num(
			member(surface, "height", quoted),
			"surface height",
		);
		const stride = num(
			member(surface, "stride", quoted),
			"surface stride",
		);
		const bpp = (stride * 8) / sWidth;
		if (bpp !== 32) {
			unsupported.push({
				where: quoted,
				what: `a ${bpp}-bit surface (only 32-bit BGRA is supported)`,
			});
		}

		pending.push({
			layer: {
				name,
				opacity,
				visible,
				blend: blend ?? "source-over",
				pixels: blankPixels(sWidth, sHeight),
			},
			surface,
		});
	}

	// Decode deferred surfaces in layer order (paint.NET appends them so). Only
	// after refusal checks pass do we spend work decompressing pixels.
	refuseIfUnsupported(FORMAT, unsupported);

	const layers: PdnLayer[] = [];
	let cursor = end;
	for (const entry of pending) {
		const surface = entry.surface!;
		const sWidth = num(
			member(surface, "width", "surface"),
			"surface width",
		);
		const sHeight = num(
			member(surface, "height", "surface"),
			"surface height",
		);
		const stride = num(
			member(surface, "stride", "surface"),
			"surface stride",
		);
		const scan0 = asObject(
			member(surface, "scan0", "surface"),
			"surface scan0",
		);
		const length = num(
			member(scan0, "length64", "scan0"),
			"surface length",
		);
		const { pixels, next } = decodeSurface(
			bytes,
			cursor,
			sWidth,
			sHeight,
			stride,
			length,
		);
		cursor = next;
		layers.push({ ...entry.layer, pixels });
	}

	return { width: canvasWidth, height: canvasHeight, layers };
};

/** A stable, deterministic layer id for the id-less {@link PdnLayer}. */
const layerId = (index: number): string => `layer-${index}`;

/**
 * Map a parsed {@link PdnDocument} to a single-frame {@link CelStoreDescription}
 * — one layer per paint.NET layer, one cel each on frame 0 — ready for
 * `SpriteDocument.fromDescription` or {@link serializeBsprite}.
 */
export const pdnToDescription = (
	doc: PdnDocument,
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
 * Convenience: parse `.pdn` bytes into a serializable
 * {@link CelStoreDescription} in one call ({@link parsePdn} →
 * {@link pdnToDescription}). Feed the result to `SpriteDocument.fromDescription`
 * to build an editor document.
 */
export const importPdn = (bytes: Uint8Array): CelStoreDescription =>
	pdnToDescription(parsePdn(bytes));

/**
 * Convenience: parse `.pdn` bytes and serialize straight to `.bsprite` archive
 * bytes ({@link importPdn} → {@link serializeBsprite}). Pure and headless for
 * files with representable blend modes (the repo's three files are all Normal),
 * so it needs no canvas compositor.
 */
export const pdnToBsprite = (bytes: Uint8Array): Uint8Array =>
	serializeBsprite(importPdn(bytes) as DocumentSnapshot);
