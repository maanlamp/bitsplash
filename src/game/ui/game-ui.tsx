import { useSyncExternalStore } from "react";
import { DialogueHud } from "../dialogue/dialogue-hud";
import type { DialogueHudState } from "../dialogue/dialogue-hud-state";
import { HealthBars } from "../health/health-bar-hud";
import type { HealthBarHudState } from "../health/health-bar-hud-state";
import { Hitsplats } from "../hitsplat/hitsplat-hud";
import { InteractHint } from "../interaction/interact-hint-hud";
import type { InteractHintHudState } from "../interaction/interact-hint-hud-state";
import { QuestMarkers } from "../quest/quest-marker-hud";
import type { QuestMarkerHudState } from "../quest/quest-marker-hud-state";
import { GameHud } from "./game-hud";
import type { GameUiActions } from "./game-ui-actions";
import type { GameUiState } from "./game-ui-state";
import type { HudState } from "./hud-state";
import { MainMenu } from "./main-menu";
import { PauseMenu } from "./pause-menu";
import { ScreenFade } from "./screen-fade";
import { SkipHint } from "./skip-hint";
import type { SkipHintState } from "./skip-hint-state";
import { Toast } from "./toast";

export type GameUiProps = Readonly<{
	state: GameUiState;
	actions: GameUiActions;
	hud: HudState;
	dialogue: DialogueHudState;
	healthBars: HealthBarHudState;
	interactHint: InteractHintHudState;
	questMarkers: QuestMarkerHudState;
	skipHint: SkipHintState;
}>;

export const GameUI = ({
	state,
	actions,
	hud,
	dialogue,
	healthBars,
	interactHint,
	questMarkers,
	skipHint,
}: GameUiProps) => {
	const snap = useSyncExternalStore(
		state.subscribe,
		state.getSnapshot,
	);
	return (
		<>
			{snap.phase === "playing" && <HealthBars store={healthBars} />}
			{snap.phase === "playing" && <Hitsplats />}
			{snap.phase === "playing" && (
				<QuestMarkers store={questMarkers} />
			)}
			{snap.phase === "playing" && (
				<InteractHint store={interactHint} />
			)}
			{snap.phase === "playing" && <GameHud hud={hud} />}
			{snap.phase === "playing" && <DialogueHud store={dialogue} />}
			{snap.phase === "playing" && <SkipHint store={skipHint} />}
			{snap.phase === "menu" && (
				<MainMenu snap={snap} actions={actions} />
			)}
			{snap.phase === "playing" && snap.paused && (
				<PauseMenu snap={snap} actions={actions} />
			)}
			{snap.toast && <Toast toast={snap.toast} />}
			<ScreenFade />
		</>
	);
};
