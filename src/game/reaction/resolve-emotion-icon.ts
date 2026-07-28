import type AssetManager from "../../engine/assets";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { EmotionId } from "../character/emotion-ids";
import emotionIconsUrl from "../content/assets/emotions.icons.png";
import type { IconCell } from "../ui/input-icon-atlas";
import { EMOTION_CELLS } from "./emotion-icon-atlas";

/** The generated placeholder atlas, one cell per {@link EmotionId}. */
export const EMOTION_ICON_SHEET_URL: string = emotionIconsUrl;

/**
 * An emotion icon ready to hand to an `image` node: the atlas plus the crop for
 * one emotion, in the same shape as `ResolvedInputIcon`.
 */
export type ResolvedEmotionIcon = Readonly<
	{ image: TileSource } & IconCell
>;

/**
 * Resolve the icon for an emotion, or `null` when there is no emotion to show
 * or the atlas has not loaded yet. Polls the asset manager, so callers may call
 * it every frame.
 *
 * @example
 * store.set(resolveEmotionIcon(assetManager, reaction.emotion));
 */
export const resolveEmotionIcon = (
	assetManager: AssetManager,
	emotion: EmotionId | null,
): ResolvedEmotionIcon | null => {
	if (emotion === null) {
		return null;
	}
	const image = assetManager.getImage(EMOTION_ICON_SHEET_URL);
	if (!image) {
		return null;
	}
	return { image, ...EMOTION_CELLS[emotion] };
};
