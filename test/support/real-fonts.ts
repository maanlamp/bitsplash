import { readFileSync } from "node:fs";
import type AssetManager from "../../src/engine/assets";
import {
	type LoadedFont,
	loadFontFamily,
} from "../../src/engine/load";
import type { FontSettings } from "../../src/engine/text/font-settings";
import {
	groupFamilies,
	readFaceMeta,
	unzipFonts,
} from "../../src/engine/text/font-source";
import { CHARACTERS } from "../../src/game/character/character-descriptor";
import { UI_FONT } from "../../src/game/dialogue/dialogue-ui";

const cache = new Map<string, Promise<LoadedFont>>();

/**
 * Load the real committed typeface a {@link FontSettings} names, at the size it
 * names — the same faces, the same rasterisation and the same family pick as
 * `AssetManager.getFontFamilies` + `resolveFont` produce at runtime.
 *
 * Layout tests need this rather than a stand-in face: a bubble's width comes from
 * the loaded font's glyph advances, so a test that measures with one typeface
 * proves nothing about the three the characters actually speak in.
 *
 * @example
 * const font = await realFont(characterById("bramble").font);
 */
export const realFont = (
	settings: FontSettings,
): Promise<LoadedFont> => {
	const key = `${settings.fontRef.path}@${settings.size}@${settings.family}`;
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}
	const loading = (async (): Promise<LoadedFont> => {
		const entries = unzipFonts(
			new Uint8Array(readFileSync(settings.fontRef.path)),
		);
		const families = groupFamilies(
			await Promise.all(entries.map((e) => readFaceMeta(e.bytes))),
		);
		const loaded = await Promise.all(
			families.map((family) =>
				loadFontFamily(
					family.name,
					family.faces.map(
						(face) => face.bytes.slice().buffer as ArrayBuffer,
					),
					settings.size,
				),
			),
		);
		const picked =
			loaded.find((font) => font.name === settings.family) ??
			loaded[0];
		if (!picked) {
			throw new Error(
				`real-fonts: ${settings.fontRef.path} carries no font faces`,
			);
		}
		return picked;
	})();
	cache.set(key, loading);
	return loading;
};

/**
 * Kick off the {@link AssetManager} load of every typeface a conversation can
 * need — the UI font plus each character's own — so a fixture's synchronous
 * `step` finds them resolved.
 *
 * A dialogue session wraps its text in the **speaker's** font, the same one the
 * conversation panel paints it in, so pre-warming a single font leaves every line
 * by anyone else unwrappable and its typewriter stuck.
 *
 * @example
 * warmDialogueFonts(fixture.assetManager);
 * await settleAssets();
 */
export const warmDialogueFonts = (assets: AssetManager): void => {
	const fonts = [
		UI_FONT,
		...Object.values(CHARACTERS).map((character) => character.font),
	];
	for (const font of fonts) {
		assets.getFontFamilies(font.fontRef.path, font.size);
	}
};
