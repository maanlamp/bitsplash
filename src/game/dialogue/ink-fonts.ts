import { FontSettings } from "../../engine/text/font-settings";
import doubleHomicideUrl from "../content/assets/doublehomicide.font.zip?url";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";

const DEFAULT = new FontSettings(fsPixelSansUrl);

const fonts: Record<string, FontSettings> = {
	doublehomicide: new FontSettings(doubleHomicideUrl, 16),
};

export const fontForTag = (name: string | undefined): FontSettings =>
	(name ? fonts[name] : undefined) ?? DEFAULT;
