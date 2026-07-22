import { strToU8, zipSync } from "fflate";
import type {
	BspriteAttachments,
	BspriteFrame,
	BspriteLayer,
	BspriteManifest,
	BspriteRect,
	BspriteTag,
	BspriteTileset,
} from "../../engine/sprite/bsprite-manifest";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import {
	type LayerInput,
	type NativeBlendCompositor,
	compositeFrame,
} from "./bake-compositor";
import { contentRectForFrames } from "./content-rect";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";
import { type PngEncoder, encodePng } from "./png-codec";

/**
 * A (layer, frame) pair with authored pixels. Presence in
 * {@link DocumentSnapshot.cels} is what makes a cel exist; absent pairs are
 * transparent (sparse cels).
 */
export type CelInput = Readonly<{
	layerId: string;
	frameIndex: number;
	pixels: PixelBuffer;
}>;

/**
 * The model-independent input to the `.bsprite` writer. It mirrors the manifest
 * shape plus the raw cel pixels, and is deliberately decoupled from any
 * particular editor document so today's single-frame `SpriteDocument` adapter
 * and Phase 1's cels model can both feed the same serializer.
 *
 * Layers are ordered **bottom→top** (index 0 painted first), matching the
 * manifest. Every `frames` index must have at least the cels needed to bake it;
 * a frame with no cels bakes to a fully-transparent canvas.
 */
export type DocumentSnapshot = Readonly<{
	width: number;
	height: number;
	layers: readonly BspriteLayer[];
	frames: readonly BspriteFrame[];
	cels: readonly CelInput[];
	tags: readonly BspriteTag[];
	attachments?: BspriteAttachments;
	slice?: NineSliceInsets;
	tileset?: BspriteTileset;
}>;

/**
 * Optional dirty-frame tracking. When a previously-loaded archive is supplied,
 * any cel or bake whose pixels did **not** change is copied byte-verbatim from
 * it instead of re-encoded, so a metadata-only save (retag, rename, retime)
 * diffs only `manifest.json`. `previous` is the parsed entry map — exactly what
 * `fflate`'s `unzipSync` returns for the loaded `.bsprite`.
 */
export type WriteOptions = Readonly<{
	previous?: Readonly<Record<string, Uint8Array>>;
	/** Return true when a cel's pixels changed since `previous` was loaded. */
	isCelDirty?: (layerId: string, frameIndex: number) => boolean;
	/** Return true when a frame's bake changed since `previous` was loaded. */
	isBakeDirty?: (frameIndex: number) => boolean;
	/** PNG encoder; defaults to the deterministic {@link encodePng}. */
	encode?: PngEncoder;
	/** Canvas compositor for native (non-`source-over`) blend modes. */
	nativeBlend?: NativeBlendCompositor;
}>;

const celPath = (layerId: string, frame: number): string =>
	`layers/${layerId}/${frame}.png`;

const bakePath = (frame: number): string => `bakes/${frame}.png`;

/** A zip entry stored uncompressed (level 0), keeping PNG bytes byte-stable. */
const stored = (bytes: Uint8Array): [Uint8Array, { level: 0 }] => [
	bytes,
	{ level: 0 },
];

/**
 * Serialize a {@link DocumentSnapshot} into `.bsprite` archive bytes:
 * `manifest.json` (DEFLATE), per-layer cel PNGs and per-frame baked PNGs (both
 * STORED). Bakes are composited by {@link compositeFrame}; per-tag content
 * rects are derived from baked alpha bounds. With {@link WriteOptions.previous}
 * set, unchanged cel/bake entries are copied byte-verbatim.
 *
 * Pure and synchronous: the default {@link encodePng} needs no DOM, so a
 * document using only `source-over`/legacy blends serializes headlessly.
 *
 * @example
 * const bytes = serializeBsprite(snapshot);
 * // ...later, a metadata-only save reusing unchanged pixels:
 * const next = serializeBsprite(snapshot2, {
 *   previous: unzipSync(bytes),
 *   isCelDirty: () => false,
 *   isBakeDirty: () => false,
 * });
 */
export const serializeBsprite = (
	snapshot: DocumentSnapshot,
	options: WriteOptions = {},
): Uint8Array => {
	const { width, height, layers, frames, cels, tags } = snapshot;
	const encode = options.encode ?? encodePng;
	const previous = options.previous;
	const isCelDirty = options.isCelDirty ?? (() => true);
	const isBakeDirty = options.isBakeDirty ?? (() => true);

	const layerIndex = new Map(layers.map((layer, i) => [layer.id, i]));
	const celByKey = new Map<string, CelInput>();
	for (const cel of cels) {
		celByKey.set(`${cel.layerId}:${cel.frameIndex}`, cel);
	}

	const entries: Record<
		string,
		Uint8Array | [Uint8Array, { level: 0 }]
	> = {};

	const reuseOrEncode = (
		path: string,
		dirty: boolean,
		pixels: PixelBuffer,
	): void => {
		const prior = previous?.[path];
		entries[path] = stored(!dirty && prior ? prior : encode(pixels));
	};

	for (const cel of cels) {
		reuseOrEncode(
			celPath(cel.layerId, cel.frameIndex),
			isCelDirty(cel.layerId, cel.frameIndex),
			cel.pixels,
		);
	}

	const bakes: PixelBuffer[] = [];
	for (let frame = 0; frame < frames.length; frame++) {
		const stack: LayerInput[] = layers.map((layer) => {
			const cel = celByKey.get(`${layer.id}:${frame}`);
			return {
				visible: layer.visible,
				opacity: layer.opacity,
				blend: layer.blend,
				pixels: cel?.pixels ?? blankPixels(width, height),
			};
		});
		const bake = compositeFrame(
			width,
			height,
			stack,
			options.nativeBlend,
		);
		bakes.push(bake);
		reuseOrEncode(bakePath(frame), isBakeDirty(frame), bake);
	}

	const contentRects: Record<string, BspriteRect> = {};
	for (const tag of tags) {
		const range: PixelBuffer[] = [];
		for (let f = tag.from; f <= tag.to && f < bakes.length; f++) {
			range.push(bakes[f]!);
		}
		const rect = contentRectForFrames(range);
		if (rect) {
			contentRects[tag.name] = rect;
		}
	}

	const manifest: BspriteManifest = {
		version: 1,
		width,
		height,
		layers,
		frames,
		cels: [...cels]
			.sort(
				(a, b) =>
					a.frameIndex - b.frameIndex ||
					(layerIndex.get(a.layerId) ?? 0) -
						(layerIndex.get(b.layerId) ?? 0),
			)
			.map((cel) => ({ layer: cel.layerId, frame: cel.frameIndex })),
		tags,
		...(Object.keys(contentRects).length > 0 ? { contentRects } : {}),
		...(snapshot.attachments
			? { attachments: snapshot.attachments }
			: {}),
		...(snapshot.slice ? { slice: snapshot.slice } : {}),
		...(snapshot.tileset ? { tileset: snapshot.tileset } : {}),
	};

	entries["manifest.json"] = strToU8(JSON.stringify(manifest));
	return zipSync(entries, { level: 6 });
};
