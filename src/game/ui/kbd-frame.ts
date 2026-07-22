import type AssetManager from "../../engine/assets";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";

/**
 * Served path of the keycap sprite archive. Referenced by literal path — the
 * same convention the prefabs use for `player.bsprite` — rather than an ESM
 * asset import, so the URL always ends in `.bsprite` (matching the facade's
 * `isBspriteUrl` classifier) and is fetched, never inlined as a data URI.
 */
const KBD_URL = "/src/game/content/assets/kbd.bsprite";

/**
 * The keycap 9-slice frame resolved from `kbd.bsprite`. `image` is the baked
 * sheet (or `null` while the archive is still loading); `insets` are the 9-slice
 * insets carried in the sprite's manifest, or `undefined` before it loads.
 * There is no hardcoded inset fallback — the manifest is the single source.
 */
export type KbdFrame = Readonly<{
	image: TileSource | null;
	insets: NineSliceInsets | undefined;
}>;

/**
 * Resolve the keycap frame from the sprite facade. Polls the `.bsprite` load
 * ({@link AssetManager.sprites}) so callers may invoke it every frame; both
 * fields are absent until the archive is loaded, at which point the image and
 * its manifest insets appear together.
 */
export const resolveKbdFrame = (
	assetManager: AssetManager,
): KbdFrame => {
	const asset = assetManager.sprites.get(KBD_URL);
	return {
		image: asset?.image ?? null,
		insets: asset?.slice(),
	};
};
