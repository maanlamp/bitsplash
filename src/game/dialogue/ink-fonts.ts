import { FontSettings } from "../../engine/text/font-settings";
import cartridgeFontUrl from "../content/assets/cartridge.font.zip?url";
import comicoroFontUrl from "../content/assets/comicoro.font.zip?url";
import doublehomicideFontUrl from "../content/assets/doublehomicide.font.zip?url";
import defaultFontUrl from "../content/assets/grapesoda_2.font.zip?url";

/**
 * The typeface every line falls back to, and the one narration renders in.
 *
 * Each of these is a shared instance: a {@link CharacterDescriptor} names one by
 * import, so the reference is checked by `tsc` and a missing `.font.zip` fails
 * when `bun run gen` resolves the descriptor — never at runtime mid-conversation.
 */
export const DEFAULT_FONT = new FontSettings(defaultFontUrl);

/** Rounded and friendly; the woodland-companion voice. */
export const CARTRIDGE_FONT = new FontSettings(cartridgeFontUrl);

/** Loose and hand-drawn; the player's own voice. */
export const COMICORO_FONT = new FontSettings(comicoroFontUrl);

/** Heavy and blocky; officialdom and swagger. */
export const DOUBLEHOMICIDE_FONT = new FontSettings(
	doublehomicideFontUrl,
);
