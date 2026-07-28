import type AssetManager from "../../engine/assets";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import { BubbleSprite } from "../content/assets/assets.gen";

/**
 * The speech-bubble 9-slice frame resolved from `bubble.bsprite`. `image` is the
 * baked sheet (or `null` while the archive is still loading); `insets` are the
 * 9-slice insets carried in the sprite's manifest, or `undefined` before it
 * loads. There is no hardcoded inset fallback — the manifest is the single
 * source.
 */
export type BubbleFrame = Readonly<{
	image: TileSource | null;
	insets: NineSliceInsets | undefined;
}>;

/** A frame that has not loaded yet, so bubbles fall back to a flat backing. */
export const UNLOADED_BUBBLE_FRAME: BubbleFrame = {
	image: null,
	insets: undefined,
};

/**
 * Resolve the bubble frame from the sprite facade. Polls the `.bsprite` load
 * ({@link AssetManager.sprites}) so callers may invoke it every frame; both
 * fields are absent until the archive is loaded, at which point the image and
 * its manifest insets appear together.
 *
 * @example
 * const frame = resolveBubbleFrame(assetManager);
 * store.set({ frame });
 */
export const resolveBubbleFrame = (
	assetManager: AssetManager,
): BubbleFrame => {
	const asset = assetManager.sprites.get(BubbleSprite.url);
	return {
		image: asset?.image ?? null,
		insets: asset?.slice(),
	};
};
