import { FontSettings } from "../../engine/text/font-settings";
import uiFontUrl from "../content/assets/grapesoda_2.font.zip?url";

export const UI_FONT = new FontSettings(uiFontUrl);

export const DIALOGUE_UI = {
	panelWidth: 280,
	maxTextLines: 3,
	padding: 16,
	marginBottom: 8,
	optionGap: 16,
};

export const dialogueTextWidth =
	DIALOGUE_UI.panelWidth - DIALOGUE_UI.padding * 2;
