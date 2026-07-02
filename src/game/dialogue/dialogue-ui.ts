import { FontSettings } from "../../engine/text/font-settings";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";

export const UI_FONT = new FontSettings(fsPixelSansUrl);

export const DIALOGUE_UI = {
	panelWidth: 280,
	maxTextLines: 3,
	padding: 16,
	marginBottom: 8,
	optionGap: 16,
};

export const dialogueTextWidth =
	DIALOGUE_UI.panelWidth - DIALOGUE_UI.padding * 2;
