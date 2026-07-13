import type AssetManager from "../../engine/assets";
import { nineSliceInsets } from "../../engine/png-metadata";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import kbdUrl from "../content/assets/kbd.9slice.png";

export const KBD_INSETS: NineSliceInsets = {
	left: 5,
	right: 5,
	top: 4,
	bottom: 7,
	gap: 0,
};

export type KbdFrame = Readonly<{
	image: TileSource | null;
	insets: NineSliceInsets;
}>;

export const resolveKbdFrame = (
	assetManager: AssetManager,
): KbdFrame => ({
	image: assetManager.getImage(kbdUrl) ?? null,
	insets:
		nineSliceInsets(assetManager.getImageMetadata(kbdUrl) || null) ??
		KBD_INSETS,
});
