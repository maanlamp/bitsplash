export type { AssetEntry } from "../project-rpc";

const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg"];
const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];
const FONT_ZIP_SUFFIX = ".font.zip";

export const TILESET_SUFFIX = ".tileset.png";

export const isTilesetName = (name: string): boolean =>
	name.toLowerCase().endsWith(TILESET_SUFFIX);

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

export type AssetType =
	| "sprite"
	| "tileset"
	| "audio"
	| "font"
	| "prefab"
	| "unknown";

const IMAGE_PATTERN = /\.(png|jpg|jpeg|webp)$/;
const PREFAB_SUFFIX = ".prefab.json";

export const classifyAsset = (name: string): AssetType => {
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
