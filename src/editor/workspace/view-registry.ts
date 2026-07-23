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
import { type AssetEntry, assetFilename } from "../assets";
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
 * Split a view id into its kind and parameter. A scene view id's parameter is
 * the scene (document) id verbatim: each scene has exactly one view, so a scene
 * view id and its document id coincide — there is no instance suffix to strip.
 */
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

/**
 * Whether `id` is a legacy multi-view scene id — a `scene:<id>#n` instance
 * suffix minted by the removed multiple-views-per-scene feature. Each scene now
 * has exactly one view, so a persisted workspace still carrying such an id must
 * drop it on load rather than resurrect a view that can never be reopened.
 */
export const isLegacyMultiViewId = (id: ViewId): boolean =>
	isSceneView(id) && id.includes("#");

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

/**
 * Icon for a view. For an asset (sprite) view, `isTileset` selects the tileset
 * icon; the caller resolves tileset-ness from the classified asset listing
 * (manifest-driven for `.bsprite`, filename-driven for legacy `.png`), so the
 * registry stays free of asset-state dependencies. Non-asset views ignore it.
 */
export const viewIcon = (id: ViewId, isTileset = false): Icon => {
	const { kind } = parseViewId(id);
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
			return isTileset ? SquaresFourIcon : FileImageIcon;
	}
};

/**
 * Whether `id` is structurally sound independent of any live listing — a known
 * singleton kind, a non-legacy scene id with a param, or an asset id with a real
 * (non-`new`) param. Used at boot to keep persisted views while the asset
 * listing and scene registry are still loading; the full {@link isValidViewId}
 * prunes against those lists once they resolve (fixes the asset-view boot-prune
 * bug where views were dropped against an empty initial list).
 */
export const isStructurallyValidViewId = (id: ViewId): boolean => {
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
		return !isLegacyMultiViewId(id) && !!param;
	}
	if (!ASSET_KINDS.includes(kind)) {
		return false;
	}
	return !!param && param !== NEW_PARAM;
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
		if (isLegacyMultiViewId(id)) {
			return false;
		}
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
