import { createElement } from "react";
import { LastUsedDevice } from "../../engine/input/last-used-device";
import type { GlobalServices } from "../../engine/services";
import type { RenderSystem, UpdateSystem } from "../../engine/system";
import { resolveFont } from "../../engine/text/resolve-font";
import { UiRuntime } from "../../engine/ui/ui-runtime";
import { BarkHudState } from "../dialogue/bark-hud-state";
import { DialogueHudState } from "../dialogue/dialogue-hud-state";
import { UI_FONT } from "../dialogue/dialogue-ui";
import { HealthBarHudState } from "../health/health-bar-hud-state";
import { InteractHintHudState } from "../interaction/interact-hint-hud-state";
import { QuestMarkerHudState } from "../quest/quest-marker-hud-state";
import { EmotionIconHudState } from "../reaction/emotion-icon-hud-state";
import { createHudSystems, type HudStores } from "./hud-systems";
import { HudState } from "./hud-state";
import { PlaytestHud } from "./playing-hud";
import { SkipHintState } from "./skip-hint-state";

export type EditorHud = Readonly<{
	ui: UiRuntime;
	update: ReadonlyArray<UpdateSystem>;
	render: ReadonlyArray<RenderSystem>;
}>;

export const createEditorHud = (
	services: GlobalServices,
): EditorHud => {
	const ui = new UiRuntime({
		resolveFont: (font) =>
			resolveFont(font ?? UI_FONT, services.assetManager),
		font: (ctx) => resolveFont(UI_FONT, ctx.assetManager),
	});
	const stores: HudStores = {
		hud: new HudState(),
		dialogue: new DialogueHudState(),
		barks: new BarkHudState(),
		healthBars: new HealthBarHudState(),
		interactHint: new InteractHintHudState(),
		questMarkers: new QuestMarkerHudState(),
		emotionIcons: new EmotionIconHudState(),
		skipHint: new SkipHintState(),
	};
	ui.mount(createElement(PlaytestHud, stores));
	const { update, render } = createHudSystems(
		ui,
		stores,
		new LastUsedDevice(),
	);
	return { ui, update, render };
};
