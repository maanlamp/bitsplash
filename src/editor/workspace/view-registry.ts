import {
	FileAudioIcon,
	FileImageIcon,
	FilmSlateIcon,
	FolderIcon,
	GaugeIcon,
	GlobeIcon,
	type Icon,
	PuzzlePieceIcon,
	SquaresFourIcon,
	TerminalIcon,
	TextAaIcon,
} from "@phosphor-icons/react";
import { sceneSummaries } from "../../engine/scene/registry";
import {
	type AssetEntry,
	assetFilename,
	isTilesetName,
} from "../assets";
import type { ViewId } from "./layout";

export type ViewKind =
	| "scene"
	| "tree"
	| "inspector"
	| "asset-browser"
	| "sprite"
	| "audio"
	| "font"
	| "console"
	| "profiler";

const ASSET_KINDS: ReadonlyArray<ViewKind> = [
	"sprite",
	"audio",
	"font",
];

export const NEW_PARAM = "new";

/**
 * Split a view id into its kind and parameter. A scene view id carries an
 * optional `#instance` suffix so multiple views can bind the same scene
 * document (plan D13: view-instance ids ≠ document ids); the suffix is stripped
 * here so `param` is always the document (scene) id, never the instance key.
 */
export const parseViewId = (
	id: ViewId,
): Readonly<{ kind: ViewKind; param: string | null }> => {
	const separator = id.indexOf(":");
	if (separator === -1) {
		return { kind: id as ViewKind, param: null };
	}
	const kind = id.slice(0, separator) as ViewKind;
	let param = id.slice(separator + 1);
	if (kind === "scene") {
		const hash = param.indexOf("#");
		if (hash !== -1) {
			param = param.slice(0, hash);
		}
	}
	return { kind, param };
};

export const makeViewId = (kind: ViewKind, param?: string): ViewId =>
	param ? `${kind}:${param}` : kind;

/**
 * The scene (document) id a scene view id binds to, with any `#instance` suffix
 * stripped. `null` for non-scene views. Both `scene:demo` and `scene:demo#2`
 * resolve to `demo` — the two views share one document.
 */
export const sceneDocumentId = (id: ViewId): string | null =>
	isSceneView(id) ? parseViewId(id).param : null;

/**
 * Mint a scene view id for `sceneId` that is not already present in `existing`.
 * The first view of a scene is `scene:${sceneId}` (backward-compatible with
 * persisted layouts); each additional view gets a `#n` instance suffix so N
 * views of one scene can coexist in the workspace.
 */
export const nextSceneViewId = (
	sceneId: string,
	existing: Iterable<ViewId>,
): ViewId => {
	const taken = new Set(existing);
	const primary = `scene:${sceneId}`;
	if (!taken.has(primary)) {
		return primary;
	}
	let n = 2;
	while (taken.has(`${primary}#${n}`)) {
		n++;
	}
	return `${primary}#${n}`;
};

export const assetViewId = (entry: AssetEntry): ViewId =>
	makeViewId(
		entry.isFont ? "font" : entry.isAudio ? "audio" : "sprite",
		entry.url,
	);

export const isAssetView = (id: ViewId): boolean =>
	ASSET_KINDS.includes(parseViewId(id).kind);

export const isSceneView = (id: ViewId): boolean =>
	parseViewId(id).kind === "scene";

export const isClosable = (id: ViewId): boolean =>
	isAssetView(id) ||
	isSceneView(id) ||
	parseViewId(id).kind === "inspector";

export const viewTitle = (id: ViewId): string => {
	const { kind, param } = parseViewId(id);
	switch (kind) {
		case "scene":
			return (
				sceneSummaries().find((s) => s.id === param)?.name ??
				param ??
				"Scene"
			);
		case "tree":
			return "Project";
		case "inspector":
			return "Inspector";
		case "asset-browser":
			return "Assets";
		case "console":
			return "Console";
		case "profiler":
			return "Profiler";
		default:
			if (param === NEW_PARAM) {
				return kind === "audio" ? "New audio" : "New sprite";
			}
			return param ? assetFilename(param) : kind;
	}
};

export const viewIcon = (id: ViewId): Icon => {
	const { kind, param } = parseViewId(id);
	switch (kind) {
		case "scene":
			return GlobeIcon;
		case "tree":
			return FilmSlateIcon;
		case "inspector":
			return PuzzlePieceIcon;
		case "asset-browser":
			return FolderIcon;
		case "console":
			return TerminalIcon;
		case "profiler":
			return GaugeIcon;
		case "audio":
			return FileAudioIcon;
		case "font":
			return TextAaIcon;
		default:
			return param && param !== NEW_PARAM && isTilesetName(param)
				? SquaresFourIcon
				: FileImageIcon;
	}
};

export const isValidViewId = (
	id: ViewId,
	assets: ReadonlyArray<AssetEntry>,
): boolean => {
	const { kind, param } = parseViewId(id);
	if (
		kind === "tree" ||
		kind === "inspector" ||
		kind === "asset-browser" ||
		kind === "console" ||
		kind === "profiler"
	) {
		return true;
	}
	if (kind === "scene") {
		return !!param && sceneSummaries().some((s) => s.id === param);
	}
	if (!ASSET_KINDS.includes(kind)) {
		return false;
	}
	if (!param || param === NEW_PARAM) {
		return false;
	}
	return assets.some((asset) => asset.url === param);
};
