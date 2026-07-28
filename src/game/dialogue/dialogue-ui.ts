import { FontSettings } from "../../engine/text/font-settings";
import uiFontUrl from "../content/assets/grapesoda_2.font.zip?url";

/**
 * The interface typeface: choice rows, hints and the rest of the HUD chrome.
 *
 * Spoken text is **not** typeset in it — a message paints in
 * `characterById(message.characterId).font`, so each speaker reads as themselves.
 * Panel geometry lives in `CONVERSATION_UI` (`conversation-view.ts`), the one
 * table the wrap width is derived from.
 */
export const UI_FONT = new FontSettings(uiFontUrl);
