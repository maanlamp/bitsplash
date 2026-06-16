import { FontSettings } from "../../engine/font-settings";
import doubleHomicideUrl from "../assets/doublehomicide.font.zip?url";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";

const DEFAULT = new FontSettings(fsPixelSansUrl);

const fonts: Record<string, FontSettings> = {
	doublehomicide: new FontSettings(doubleHomicideUrl, 16),
};

export const fontForTag = (name: string | undefined): FontSettings =>
	(name ? fonts[name] : undefined) ?? DEFAULT;
