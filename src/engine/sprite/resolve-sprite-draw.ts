import type AssetManager from "../assets";
import type { TileSource } from "../render/renderer-2d";
import { isBspriteUrl } from "./sprite-asset-cache";
import {
	bspriteSource,
	type SpriteComponent,
	type SpriteSource,
	spriteImageUrl,
	spriteSource,
} from "./sprite-component";

/**
 * The image texture plus the current frame's source sub-rect a sprite should be
 * drawn with, resolved through whichever backing a sprite uses: a `.bsprite`
 * facade (composed sheet + tag-derived content rect) or a legacy PNG (shared
 * image + clip/content rect).
 */
export type SpriteDraw = Readonly<{
	image: TileSource;
	source: SpriteSource;
}>;

/**
 * Resolve the image and current-frame source rect for a sprite, branching on
 * `.bsprite` vs legacy exactly once so every draw path (fill, outline, ...)
 * stays in lockstep. Returns `null` while the backing asset is still loading,
 * so callers may poll it every frame and simply skip the sprite when `null`.
 *
 * @example
 * const draw = resolveSpriteDraw(sprite, assetManager);
 * if (draw) renderer.drawImageOutline(layer, draw.image, { ...draw.source });
 */
export const resolveSpriteDraw = (
	sprite: SpriteComponent,
	assetManager: AssetManager,
): SpriteDraw | null => {
	if (isBspriteUrl(sprite.urlRef.path)) {
		const asset = assetManager.sprites.get(sprite.urlRef.path);
		if (!asset) {
			return null;
		}
		return {
			image: asset.image,
			source: bspriteSource(sprite, asset),
		};
	}
	const legacy = assetManager.getImage(spriteImageUrl(sprite));
	if (!legacy) {
		return null;
	}
	return { image: legacy, source: spriteSource(sprite, legacy) };
};
