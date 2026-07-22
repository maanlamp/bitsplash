export type { AssetEntry } from "../project-rpc";
import type { AssetKind } from "../project-rpc";
import { TILESET_SUFFIX } from "../engine/tilemap/autotile";

const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg"];
const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];
const FONT_ZIP_SUFFIX = ".font.zip";

export { TILESET_SUFFIX };

/**
 * Human-facing tileset suffix for `.bsprite` tilesets. Classification of a
 * `.bsprite` is manifest-driven (presence of the `tileset` block); this suffix
 * is the naming convention the editor's tileset-vs-sprite *view mode* still keys
 * on until that mode becomes a document property (plan step 7).
 */
export const TILESET_BSPRITE_SUFFIX = ".tileset.bsprite";

export const isTilesetName = (name: string): boolean => {
	const lower = name.toLowerCase();
	return (
		lower.endsWith(TILESET_SUFFIX) ||
		lower.endsWith(TILESET_BSPRITE_SUFFIX)
	);
};

export const isFontName = (name: string): boolean => {
	const lower = name.toLowerCase();
	return (
		lower.endsWith(FONT_ZIP_SUFFIX) ||
		FONT_EXTENSIONS.some((ext) => lower.endsWith(ext))
	);
};

export const assetFilename = (url: string): string => {
	const clean = url.split("?")[0] ?? url;
	return clean.split("/").pop() ?? clean;
};

export type AssetType = AssetKind;

const IMAGE_PATTERN = /\.(png|jpg|jpeg|webp)$/;
const PREFAB_SUFFIX = ".prefab.json";

/**
 * Classify an asset. `.bsprite` files are classified by the manifest-driven
 * `kind` enriched onto the listing by the main process (presence of the
 * manifest `tileset` block distinguishes tileset from sprite); pass it as
 * `kind`. Every other file — including legacy `.png`/`.tileset.png` — is
 * classified by filename here.
 */
export const classifyAsset = (
	name: string,
	kind?: AssetKind,
): AssetType => {
	if (kind) {
		return kind;
	}
	const lower = name.toLowerCase();
	if (lower.endsWith(TILESET_SUFFIX)) {
		return "tileset";
	}
	if (IMAGE_PATTERN.test(lower)) {
		return "sprite";
	}
	if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
		return "audio";
	}
	if (isFontName(name)) {
		return "font";
	}
	if (lower.endsWith(PREFAB_SUFFIX)) {
		return "prefab";
	}
	return "unknown";
};
