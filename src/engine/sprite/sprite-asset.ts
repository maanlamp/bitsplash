import { unzipSync } from "fflate";
import type { NineSliceInsets } from "../render/nine-slice";
import type { TileSource } from "../render/renderer-2d";
import type {
	BspriteManifest,
	BspritePoint,
	BspriteRect,
	BspriteTileset,
} from "./bsprite-manifest";

const MANIFEST_ENTRY = "manifest.json";

const sourceWidth = (source: TileSource): number =>
	"naturalWidth" in source ? source.naturalWidth : source.width;

const sourceHeight = (source: TileSource): number =>
	"naturalHeight" in source ? source.naturalHeight : source.height;

/**
 * Parse the `manifest.json` entry from an already-unzipped `.bsprite` archive.
 * Pure and DOM-free (no canvas decode), so it is directly unit-testable.
 *
 * @throws if the archive has no `manifest.json` or it is not valid JSON.
 */
export const manifestFromEntries = (
	entries: Readonly<Record<string, Uint8Array>>,
): BspriteManifest => {
	const raw = entries[MANIFEST_ENTRY];
	if (!raw) {
		throw new Error(`.bsprite archive missing ${MANIFEST_ENTRY}`);
	}
	return JSON.parse(new TextDecoder().decode(raw)) as BspriteManifest;
};

/**
 * Read the manifest out of raw `.bsprite` bytes (fetch result). Unzips then
 * parses `manifest.json`. Pure and DOM-free — used both by the loader and by
 * tests that build a synthetic archive with `fflate`.
 *
 * @example
 * const zip = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)) });
 * const manifest = readBspriteManifest(zip);
 */
export const readBspriteManifest = (
	bytes: Uint8Array,
): BspriteManifest => manifestFromEntries(unzipSync(bytes));

/**
 * Resolve a tag's content rect. Falls back to the full canvas rect when the tag
 * has no derived rect (fully-transparent tag) or no tag is given (legacy /
 * untagged playback).
 */
export const bspriteContentRect = (
	manifest: BspriteManifest,
	tag?: string,
): BspriteRect => {
	const rect =
		tag === undefined ? undefined : manifest.contentRects?.[tag];
	return (
		rect ?? {
			x: 0,
			y: 0,
			width: manifest.width,
			height: manifest.height,
		}
	);
};

/**
 * Resolve a named attachment point for a frame, returning `undefined` when the
 * frame has no entry for that point — there is no nearest-frame fallback.
 *
 * The point is returned in the **authored, unmirrored** canvas-pixel space
 * exactly as stored. Mirroring for a left-facing (`flipX`) sprite is **not** done
 * here: a mirror about the canvas center would be wrong, because the sprite
 * renders with its per-tag content rect centered on the entity, not the canvas.
 * The consumer mirrors about the content-rect center instead — see
 * `attachmentWorldOffset` in `game/combat/grip-offset.ts`.
 */
export const bspriteAttachment = (
	manifest: BspriteManifest,
	name: string,
	frame: number,
): BspritePoint | undefined =>
	manifest.attachments?.[name]?.[String(frame)];

/**
 * Turns an unzipped `.bsprite` archive plus its parsed manifest into the single
 * sheet {@link TileSource} the renderer samples. Injectable ({@link SpriteAsset.loadBsprite},
 * {@link import("../assets").default.loadBspriteAsset}) so the facade's load
 * path runs without a DOM: the default {@link composeSheet} needs `document`
 * and `createImageBitmap`, so a headless caller substitutes a pure composer
 * that decodes with {@link import("../../editor/sprite/png-codec").decodePng}.
 */
export type SheetComposer = (
	entries: Readonly<Record<string, Uint8Array>>,
	manifest: BspriteManifest,
) => Promise<TileSource>;

/**
 * Compose the baked frame PNGs into a single horizontal sheet canvas: frame `i`
 * is drawn at `x = i * width`, matching the `spriteSource` frame math and
 * keeping all frames on one texture for consecutive-same-texture batching.
 * A canvas is a valid {@link TileSource}, so no `createImageBitmap`-based
 * widening is needed. This is the default {@link SheetComposer}; it needs a DOM.
 */
export const composeSheet: SheetComposer = async (
	entries: Readonly<Record<string, Uint8Array>>,
	manifest: BspriteManifest,
): Promise<HTMLCanvasElement> => {
	const { width, height, frames } = manifest;
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, width * frames.length);
	canvas.height = Math.max(1, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to acquire 2d context for sprite sheet");
	}
	for (let i = 0; i < frames.length; i++) {
		const png = entries[`bakes/${i}.png`];
		if (!png) {
			continue;
		}
		const bitmap = await createImageBitmap(
			new Blob([png as BlobPart], { type: "image/png" }),
		);
		ctx.drawImage(bitmap, i * width, 0);
		bitmap.close();
	}
	return canvas;
};

/**
 * A loaded sprite asset: composed pixels plus metadata, unifying `.bsprite`
 * (baked frames + manifest) and legacy PNG (image only) behind one accessor
 * surface. Constructed by {@link SpriteAssetCache}; query it every frame —
 * accessors are cheap and never throw.
 */
export class SpriteAsset {
	private constructor(
		readonly url: string,
		/** The sheet (`.bsprite`) or the source image (legacy PNG). */
		readonly image: TileSource,
		private readonly manifest: BspriteManifest | null,
	) {}

	/**
	 * Unzip, parse and compose a `.bsprite` archive into an asset. The sheet is
	 * built by `compose` — the default {@link composeSheet} needs a DOM, so a
	 * headless caller injects a pure composer.
	 */
	static async loadBsprite(
		url: string,
		bytes: Uint8Array,
		compose: SheetComposer = composeSheet,
	): Promise<SpriteAsset> {
		const entries = unzipSync(bytes);
		const manifest = manifestFromEntries(entries);
		const sheet = await compose(entries, manifest);
		return new SpriteAsset(url, sheet, manifest);
	}

	/**
	 * Wrap an already-loaded legacy PNG. A legacy PNG carries no manifest, so it
	 * has no 9-slice insets — consumers needing insets for a non-`.bsprite` asset
	 * keep their own fallback.
	 */
	static legacy(url: string, image: TileSource): SpriteAsset {
		return new SpriteAsset(url, image, null);
	}

	/** True when this asset is a baked `.bsprite`, false for legacy PNG. */
	get baked(): boolean {
		return this.manifest !== null;
	}

	/** Canvas width in pixels (one frame's width for a `.bsprite`). */
	get width(): number {
		return this.manifest?.width ?? sourceWidth(this.image);
	}

	/** Canvas height in pixels. */
	get height(): number {
		return this.manifest?.height ?? sourceHeight(this.image);
	}

	/** Frame count (always 1 for legacy PNG). */
	get frameCount(): number {
		return this.manifest?.frames.length ?? 1;
	}

	/** The full manifest, or `null` for a legacy PNG. */
	get spriteManifest(): BspriteManifest | null {
		return this.manifest;
	}

	/**
	 * 9-slice insets from the `.bsprite` manifest, or `undefined` when the asset
	 * carries none (always `undefined` for a legacy PNG).
	 */
	slice(): NineSliceInsets | undefined {
		return this.manifest?.slice;
	}

	/** Content rect for a tag, falling back to the full canvas rect. */
	contentRect(tag?: string): BspriteRect {
		if (this.manifest) {
			return bspriteContentRect(this.manifest, tag);
		}
		return { x: 0, y: 0, width: this.width, height: this.height };
	}

	/**
	 * Named attachment point for a frame in **authored, unmirrored** canvas-pixel
	 * space, `undefined` when absent. Always `undefined` for legacy PNG. Mirroring
	 * for a left-facing sprite is applied downstream about the content-rect center
	 * (see `attachmentWorldOffset`), never here.
	 */
	attachment(name: string, frame: number): BspritePoint | undefined {
		return this.manifest
			? bspriteAttachment(this.manifest, name, frame)
			: undefined;
	}

	/** Tileset block when present (its presence classifies a tileset). */
	tileset(): BspriteTileset | undefined {
		return this.manifest?.tileset;
	}
}
