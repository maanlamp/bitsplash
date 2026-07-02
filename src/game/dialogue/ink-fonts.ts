import { FontSettings } from "../../engine/text/font-settings";
import cartridgeUrl from "../content/assets/cartridge.font.zip?url";
import comicoroUrl from "../content/assets/comicoro.font.zip?url";
import doubleHomicideUrl from "../content/assets/doublehomicide.font.zip?url";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";

const DEFAULT = new FontSettings(fsPixelSansUrl);

export const PLAYER_FONT = new FontSettings(comicoroUrl, 16);

const fonts: Record<string, FontSettings> = {
	doublehomicide: new FontSettings(doubleHomicideUrl, 16),
	cartridge: new FontSettings(cartridgeUrl, 16),
	comicoro: PLAYER_FONT,
};

export const fontForTag = (name: string | undefined): FontSettings =>
	(name ? fonts[name] : undefined) ?? DEFAULT;
