import type AssetManager from "../../engine/assets";
import type { GamepadFamily } from "../../engine/input/detect-gamepad-type";
import type { TileSource } from "../../engine/render/renderer-2d";
import psUrl from "../content/assets/ps.icons.png";
import switchUrl from "../content/assets/switch.icons.png";
import xboxUrl from "../content/assets/xbox.icons.png";

export const ICON_CELL_SIZE = 16;
export const ICON_COLUMNS = 8;

export type BrandedFamily = Exclude<GamepadFamily, "generic">;

const FAMILY_URL: Record<BrandedFamily, string> = {
	xbox: xboxUrl,
	playstation: psUrl,
	switch: switchUrl,
};

export const isBrandedFamily = (
	family: GamepadFamily,
): family is BrandedFamily => family !== "generic";

export type IconCell = Readonly<{
	srcX: number;
	srcY: number;
	srcW: number;
	srcH: number;
}>;

export const iconCell = (index: number): IconCell => ({
	srcX: (index % ICON_COLUMNS) * ICON_CELL_SIZE,
	srcY: Math.floor(index / ICON_COLUMNS) * ICON_CELL_SIZE,
	srcW: ICON_CELL_SIZE,
	srcH: ICON_CELL_SIZE,
});

export type ResolvedInputIcon = Readonly<{
	image: TileSource;
	srcX: number;
	srcY: number;
	srcW: number;
	srcH: number;
}>;

export const resolveInputIcon = (
	assetManager: AssetManager,
	family: BrandedFamily,
	index: number,
): ResolvedInputIcon | null => {
	const image = assetManager.getImage(FAMILY_URL[family]);
	if (!image) {
		return null;
	}
	return { image, ...iconCell(index) };
};
