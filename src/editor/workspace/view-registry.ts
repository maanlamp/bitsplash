import {
	FileAudioIcon,
	FileImageIcon,
	FilmSlateIcon,
	GlobeIcon,
	type Icon,
	PuzzlePieceIcon,
	SquaresFourIcon,
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
	| "sprite"
	| "audio"
	| "font";

const ASSET_KINDS: ReadonlyArray<ViewKind> = [
	"sprite",
	"audio",
	"font",
];

export const NEW_PARAM = "new";

export const parseViewId = (
	id: ViewId,
): Readonly<{ kind: ViewKind; param: string | null }> => {
	const separator = id.indexOf(":");
	if (separator === -1) {
		return { kind: id as ViewKind, param: null };
	}
	return {
		kind: id.slice(0, separator) as ViewKind,
		param: id.slice(separator + 1),
	};
};

export const makeViewId = (kind: ViewKind, param?: string): ViewId =>
	param ? `${kind}:${param}` : kind;

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
	if (kind === "tree" || kind === "inspector") {
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
