export type AssetEntry = Readonly<{
	name: string;
	url: string;
	ext: string;
	isPng: boolean;
	isAudio: boolean;
	isFont: boolean;
	isTileset: boolean;
}>;

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

const modules = import.meta.glob("../game/assets/*", {
	query: "?url",
	import: "default",
	eager: true,
}) as Record<string, string>;

export const listAssets = (): ReadonlyArray<AssetEntry> => {
	const entries: AssetEntry[] = [];
	for (const [path, url] of Object.entries(modules)) {
		const name = path.split("/").pop() ?? path;
		const ext = name.split(".").toSpliced(0, 1).join(".");
		const lower = name.toLowerCase();
		entries.push({
			name,
			url,
			ext,
			isPng: lower.endsWith(".png"),
			isAudio: AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext)),
			isFont: isFontName(name),
			isTileset: lower.endsWith(TILESET_SUFFIX),
		});
	}
	entries
		.sort((a, b) => a.name.localeCompare(b.name))
		.sort((a, b) => a.ext.localeCompare(b.ext));
	return entries;
};

export const assetFilename = (url: string): string => {
	const clean = url.split("?")[0] ?? url;
	return clean.split("/").pop() ?? clean;
};
