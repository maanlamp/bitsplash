import type AssetManager from "../assets";
import type { FontSettings } from "../text/font-settings";

export const resolveFont = (
	settings: FontSettings,
	assetManager: AssetManager,
) => {
	const families = assetManager.getFontFamilies(
		settings.font,
		settings.size,
	);
	if (!families) {
		return null;
	}
	return (
		families.find((f) => f.name === settings.family) ??
		families[0] ??
		null
	);
};
