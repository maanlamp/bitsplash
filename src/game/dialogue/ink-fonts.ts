import { FontSettings } from "../../engine/text/font-settings";
import defaultFontUrl from "../content/assets/grapesoda_2.font.zip?url";

const fonts: Record<string, FontSettings> = {
	default: new FontSettings(defaultFontUrl),
};

export const fontForTag = (
	name: keyof typeof fonts | undefined,
): FontSettings => (name ? fonts[name] : undefined) ?? fonts.default!;
