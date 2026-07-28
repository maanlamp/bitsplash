import type { LastUsedDevice } from "../../engine/input/last-used-device";
import { LastUsedDeviceSystem } from "../../engine/input/last-used-device-system";
import type { RenderSystem, UpdateSystem } from "../../engine/system";
import type { UiRuntime } from "../../engine/ui/ui-runtime";
import type { BarkHudState } from "../dialogue/bark-hud-state";
import { BarkHudSystem } from "../dialogue/bark-hud-system";
import type { DialogueHudState } from "../dialogue/dialogue-hud-state";
import { ConversationFocusSystem } from "../dialogue/conversation-focus-system";
import { DialogueHudDynSystem } from "../dialogue/dialogue-hud-dyn-system";
import { DialogueHudSyncSystem } from "../dialogue/dialogue-hud-sync-system";
import type { HealthBarHudState } from "../health/health-bar-hud-state";
import { HealthBarHudSystem } from "../health/health-bar-hud-system";
import { HitsplatHudSystem } from "../hitsplat/hitsplat-hud-system";
import type { InteractHintHudState } from "../interaction/interact-hint-hud-state";
import { InteractHintHudSystem } from "../interaction/interact-hint-hud-system";
import type { QuestMarkerHudState } from "../quest/quest-marker-hud-state";
import { QuestMarkerHudSystem } from "../quest/quest-marker-hud-system";
import type { EmotionIconHudState } from "../reaction/emotion-icon-hud-state";
import { EmotionIconHudSystem } from "../reaction/emotion-icon-hud-system";
import { HudDynSystem } from "./hud-dyn-system";
import type { HudState } from "./hud-state";
import { HudSyncSystem } from "./hud-sync-system";
import { ScreenFadeHudSystem } from "./screen-fade-hud-system";
import type { SkipHintState } from "./skip-hint-state";
import { SkipHintSyncSystem } from "./skip-hint-system";

export type HudStores = Readonly<{
	hud: HudState;
	dialogue: DialogueHudState;
	barks: BarkHudState;
	healthBars: HealthBarHudState;
	interactHint: InteractHintHudState;
	questMarkers: QuestMarkerHudState;
	emotionIcons: EmotionIconHudState;
	skipHint: SkipHintState;
}>;

export type HudSystems = Readonly<{
	update: ReadonlyArray<UpdateSystem>;
	render: ReadonlyArray<RenderSystem>;
}>;

export const createHudSystems = (
	ui: UiRuntime,
	stores: HudStores,
	lastUsedDevice: LastUsedDevice,
): HudSystems => ({
	update: [
		new LastUsedDeviceSystem(lastUsedDevice),
		new HudSyncSystem(stores.hud),
		new DialogueHudSyncSystem(stores.dialogue, lastUsedDevice),
		new HealthBarHudSystem(stores.healthBars, ui.root, ui.dyn),
		new InteractHintHudSystem(
			stores.interactHint,
			ui.root,
			ui.dyn,
			lastUsedDevice,
		),
		new QuestMarkerHudSystem(stores.questMarkers, ui.root, ui.dyn),
		new EmotionIconHudSystem(stores.emotionIcons, ui.root, ui.dyn),
		new HitsplatHudSystem(ui.root, ui.dyn),
		new SkipHintSyncSystem(
			stores.skipHint,
			ui.root,
			ui.dyn,
			lastUsedDevice,
		),
	],
	render: [
		new HudDynSystem(ui.root, ui.dyn),
		new DialogueHudDynSystem(ui.root, ui.dyn),
		new BarkHudSystem(stores.barks, ui.root, ui.dyn),
		new ConversationFocusSystem(
			ui.root,
			ui.dispatcher,
			stores.dialogue,
		),
		new ScreenFadeHudSystem(ui.root, ui.dyn),
		ui.paintSystem,
	],
});
