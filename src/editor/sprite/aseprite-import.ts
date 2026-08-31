import { unzlibSync } from "fflate";
import type {
	BlendId,
	BspriteFrame,
} from "../../engine/sprite/bsprite-manifest";
import { type CelInput, serializeBsprite } from "./bsprite-writer";
import type { CelStoreDescription } from "./cel-store";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * A layer parsed from an `.aseprite` file, in Aseprite's bottom→top order
 * (index 0 is backmost) — the same order {@link BspriteLayer} uses. `opacity`
 * is normalized to `0..1`; `blend` is already mapped to a {@link BlendId}.
 */
export type AsepriteLayer = Readonly<{
	name: string;
	opacity: number;
	visible: boolean;
	blend: BlendId;
}>;

/**
 * One decoded cel: a full-canvas-sized {@link PixelBuffer} (the Aseprite cel's
 * sub-rectangle composited into a transparent canvas at its offset) keyed by
 * the (layer index, frame index) it belongs to. Sparse — only authored cels
 * are present.
 */
export type AsepriteCel = Readonly<{
	layerIndex: number;
	frameIndex: number;
	pixels: PixelBuffer;
}>;

/** A named frame range parsed from an Aseprite frame-tags chunk (0x2018). */
export type AsepriteTag = Readonly<{
	name: string;
	from: number;
	to: number;
	loop: boolean;
}>;

/**
 * The intermediate parse of one `.aseprite` file — canvas size, per-frame
 * durations, layers (bottom→top), decoded cels, and tags — with no DOM
 * dependency and no id assignment. This is the unit the actor migration
 * (step 19) merges six of into a single `player.bsprite`; use
 * {@link asepriteToDescription} to turn a single document into a serializable
 * {@link CelStoreDescription}.
 */
export type AsepriteDocument = Readonly<{
	width: number;
	height: number;
	frames: readonly BspriteFrame[];
	layers: readonly AsepriteLayer[];
	cels: readonly AsepriteCel[];
	tags: readonly AsepriteTag[];
}>;

const HEADER_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;
const RGBA_DEPTH = 32;

const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_TAGS = 0x2018;

const LAYER_TYPE_IMAGE = 0;
const LAYER_FLAG_VISIBLE = 1;

const CEL_RAW = 0;
const CEL_LINKED = 1;
const CEL_COMPRESSED = 2;

/**
 * Aseprite blend-mode index → {@link BlendId}. Aseprite's 19 modes map onto our
 * set with no loss: the 16 W3C native modes map straight through, Addition (16)
 * → `lighter`, and the two legacy pixel-math modes Subtract (17) / Divide (18)
 * → our legacy ids. Aseprite has no Reflect/Glow/Negation (those are
 * paint.NET-only), so every representable Aseprite mode is covered; an index
 * outside this table is an unsupported-feature refusal.
 */
const ASEPRITE_BLEND: readonly BlendId[] = [
	"source-over",
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
	"color-dodge",
	"color-burn",
	"hard-light",
	"soft-light",
	"difference",
	"exclusion",
	"hue",
	"saturation",
	"color",
	"luminosity",
	"lighter",
	"subtract",
	"divide",
];

type Cursor = {
	readonly view: DataView;
	readonly bytes: Uint8Array;
};

const u8 = (c: Cursor, at: number): number => c.view.getUint8(at);
const u16 = (c: Cursor, at: number): number =>
	c.view.getUint16(at, true);
const i16 = (c: Cursor, at: number): number =>
	c.view.getInt16(at, true);
const u32 = (c: Cursor, at: number): number =>
	c.view.getUint32(at, true);

/** Read an Aseprite STRING (WORD length prefix + UTF-8 bytes) at `at`. */
const readString = (c: Cursor, at: number): string => {
	const length = u16(c, at);
	return new TextDecoder().decode(
		c.bytes.subarray(at + 2, at + 2 + length),
	);
};

const celKey = (layerIndex: number, frameIndex: number): string =>
	`${layerIndex}#${frameIndex}`;

/**
 * Blit an Aseprite cel's straight-alpha RGBA sub-rectangle (`src`, `srcW`×
 * `srcH`, placed at canvas offset `x`,`y`) into a fresh full-canvas buffer,
 * clipping to the canvas bounds. `celOpacity` (0..255) is folded into the alpha
 * channel because the cel model has no per-cel opacity — only per-layer.
 */
const blitCel = (
	src: Uint8Array,
	srcW: number,
	srcH: number,
	x: number,
	y: number,
	canvasW: number,
	canvasH: number,
	celOpacity: number,
): PixelBuffer => {
	const out = blankPixels(canvasW, canvasH);
	for (let sy = 0; sy < srcH; sy++) {
		const dy = y + sy;
		if (dy < 0 || dy >= canvasH) {
			continue;
		}
		for (let sx = 0; sx < srcW; sx++) {
			const dx = x + sx;
			if (dx < 0 || dx >= canvasW) {
				continue;
			}
			const si = (sy * srcW + sx) * 4;
			const di = (dy * canvasW + dx) * 4;
			out.data[di] = src[si]!;
			out.data[di + 1] = src[si + 1]!;
			out.data[di + 2] = src[si + 2]!;
			const alpha = src[si + 3]!;
			out.data[di + 3] =
				celOpacity === 255
					? alpha
					: Math.round((alpha * celOpacity) / 255);
		}
	}
	return out;
};

const mapBlend = (index: number): BlendId => {
	const blend = ASEPRITE_BLEND[index];
	if (!blend) {
		throw new Error(
			`Unsupported Aseprite blend mode (index ${index}); no .bsprite equivalent.`,
		);
	}
	return blend;
};

/**
 * Parse an `.aseprite` file into an {@link AsepriteDocument}: header, per-frame
 * durations, layer chunks (0x2004), cel chunks (0x2005; raw/linked/compressed),
 * and tag chunks (0x2018). Cels are composited into full-canvas
 * {@link PixelBuffer}s; linked cels resolve to the referenced frame's cel for
 * the same layer. Pure and DOM-free — decodes zlib cel data with `fflate` and
 * decodes nothing through a canvas — so it runs headlessly and can be reused by
 * the actor migration.
 *
 * Only 32-bit RGBA color depth and normal image layers are supported. A
 * grayscale/indexed file, a layer group or tilemap layer, a tilemap cel, or an
 * unmappable blend mode is **refused** with an error naming the offending
 * feature (the plan's Phase-4 import policy), never silently flattened.
 *
 * @throws if the bytes are not an `.aseprite` file, use an unsupported color
 * depth/layer/cel/blend feature, or a linked cel references a missing source.
 */
export const parseAseprite = (
	bytes: Uint8Array,
): AsepriteDocument => {
	const c: Cursor = {
		view: new DataView(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		),
		bytes,
	};
	if (u16(c, 4) !== HEADER_MAGIC) {
		throw new Error("Not an .aseprite file (bad header magic).");
	}
	const frameCount = u16(c, 6);
	const width = u16(c, 8);
	const height = u16(c, 10);
	const depth = u16(c, 12);
	if (depth !== RGBA_DEPTH) {
		throw new Error(
			`Unsupported Aseprite color depth ${depth} (only 32-bit RGBA is supported).`,
		);
	}

	const layers: AsepriteLayer[] = [];
	const frames: BspriteFrame[] = [];
	const celsByKey = new Map<string, PixelBuffer>();
	let tags: AsepriteTag[] = [];

	let frameOffset = 128;
	for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
		const frameBytes = u32(c, frameOffset);
		if (u16(c, frameOffset + 4) !== FRAME_MAGIC) {
			throw new Error(`Bad frame magic at frame ${frameIndex}.`);
		}
		frames.push({ duration: u16(c, frameOffset + 8) });
		const newChunks = u32(c, frameOffset + 12);
		const chunkCount =
			newChunks !== 0 ? newChunks : u16(c, frameOffset + 6);

		let chunkOffset = frameOffset + 16;
		for (let ci = 0; ci < chunkCount; ci++) {
			const chunkSize = u32(c, chunkOffset);
			const chunkType = u16(c, chunkOffset + 4);
			// Chunk data starts after the 6-byte (DWORD size + WORD type) header.
			const d = chunkOffset + 6;

			if (chunkType === CHUNK_LAYER) {
				const flags = u16(c, d);
				const layerType = u16(c, d + 2);
				const name = readString(c, d + 16);
				if (layerType !== LAYER_TYPE_IMAGE) {
					throw new Error(
						`Layer "${name}" is a ${layerType === 1 ? "group" : "tilemap"} layer, which .bsprite cannot represent.`,
					);
				}
				layers.push({
					name,
					blend: mapBlend(u16(c, d + 10)),
					opacity: u8(c, d + 12) / 255,
					visible: (flags & LAYER_FLAG_VISIBLE) !== 0,
				});
			} else if (chunkType === CHUNK_CEL) {
				const layerIndex = u16(c, d);
				const x = i16(c, d + 2);
				const y = i16(c, d + 4);
				const celOpacity = u8(c, d + 6);
				const celType = u16(c, d + 7);
				// layerIndex,x,y (6) + opacity (1) + type (2) + z-index (2) +
				// reserved (5) = 16 bytes before the type-specific payload.
				const payload = d + 16;
				if (celType === CEL_COMPRESSED || celType === CEL_RAW) {
					const cw = u16(c, payload);
					const ch = u16(c, payload + 2);
					const compressed = bytes.subarray(
						payload + 4,
						d + chunkSize,
					);
					const pixels =
						celType === CEL_COMPRESSED
							? unzlibSync(compressed)
							: compressed;
					celsByKey.set(
						celKey(layerIndex, frameIndex),
						blitCel(pixels, cw, ch, x, y, width, height, celOpacity),
					);
				} else if (celType === CEL_LINKED) {
					const linkedFrame = u16(c, payload);
					const source = celsByKey.get(
						celKey(layerIndex, linkedFrame),
					);
					if (!source) {
						throw new Error(
							`Linked cel (layer ${layerIndex}, frame ${frameIndex}) references missing frame ${linkedFrame}.`,
						);
					}
					celsByKey.set(celKey(layerIndex, frameIndex), source);
				} else {
					throw new Error(
						`Unsupported cel type ${celType} (layer ${layerIndex}, frame ${frameIndex}); tilemap cels are not supported.`,
					);
				}
			} else if (chunkType === CHUNK_TAGS) {
				tags = readTags(c, d);
			}

			chunkOffset += chunkSize;
		}
		frameOffset += frameBytes;
	}

	const cels: AsepriteCel[] = [];
	for (const [key, pixels] of celsByKey) {
		const hash = key.indexOf("#");
		cels.push({
			layerIndex: Number(key.slice(0, hash)),
			frameIndex: Number(key.slice(hash + 1)),
			pixels,
		});
	}

	return { width, height, frames, layers, cels, tags };
};

/**
 * Read a frame-tags chunk (0x2018) at data offset `d`. Loop flag is derived
 * from the Aseprite `repeat` count: `0` (play indefinitely) → `loop: true`,
 * any finite repeat → `loop: false`.
 */
const readTags = (c: Cursor, d: number): AsepriteTag[] => {
	const count = u16(c, d);
	const tags: AsepriteTag[] = [];
	// WORD count + BYTE[8] reserved before the first tag entry.
	let at = d + 10;
	for (let i = 0; i < count; i++) {
		const from = u16(c, at);
		const to = u16(c, at + 2);
		const repeat = u16(c, at + 5);
		// from,to (4) + direction (1) + repeat (2) + reserved (6) +
		// deprecated RGB (3) + extra byte (1) = 17 bytes, then a STRING
		// (WORD byte-length + UTF-8 bytes).
		const nameLength = u16(c, at + 17);
		const name = readString(c, at + 17);
		tags.push({ name, from, to, loop: repeat === 0 });
		at += 17 + 2 + nameLength;
	}
	return tags;
};

/**
 * A stable layer id for the `id`-less {@link AsepriteLayer} — deterministic
 * (`layer-<index>`) so a single-file import serializes byte-stably. The actor
 * migration (step 19), which merges layers across files, assigns its own ids.
 */
const layerId = (index: number): string => `layer-${index}`;

/**
 * Map a parsed {@link AsepriteDocument} to a {@link CelStoreDescription} —
 * assigning each layer a stable id and re-keying cels by that id — ready for
 * {@link import("./sprite-document").SpriteDocument.fromDescription} or
 * {@link serializeBsprite}. The `.aseprite` carries no tags in the actor
 * strips, so `tags` is typically empty here; step 19 tags the merged ranges.
 */
export const asepriteToDescription = (
	doc: AsepriteDocument,
): CelStoreDescription => {
	const layers = doc.layers.map((layer, index) => ({
		id: layerId(index),
		name: layer.name,
		opacity: layer.opacity,
		visible: layer.visible,
		blend: layer.blend,
	}));
	const cels: CelInput[] = doc.cels.map((cel) => ({
		layerId: layerId(cel.layerIndex),
		frameIndex: cel.frameIndex,
		pixels: cel.pixels,
	}));
	return {
		width: doc.width,
		height: doc.height,
		layers,
		frames: doc.frames,
		cels,
		tags: doc.tags.map((tag) => ({
			name: tag.name,
			from: tag.from,
			to: tag.to,
			loop: tag.loop,
		})),
	};
};

/**
 * Convenience: parse `.aseprite` bytes into a serializable
 * {@link CelStoreDescription} in one call
 * ({@link parseAseprite} → {@link asepriteToDescription}). Feed the result to
 * `SpriteDocument.fromDescription` to build an editor document.
 */
export const importAseprite = (
	bytes: Uint8Array,
): CelStoreDescription => asepriteToDescription(parseAseprite(bytes));

/**
 * Convenience: parse `.aseprite` bytes and serialize straight to `.bsprite`
 * archive bytes ({@link importAseprite} → {@link serializeBsprite}). Pure and
 * headless for RGBA files with representable blend modes (the actor strips are
 * all Normal), so it needs no canvas compositor.
 */
export const asepriteToBsprite = (bytes: Uint8Array): Uint8Array =>
	serializeBsprite(importAseprite(bytes));
