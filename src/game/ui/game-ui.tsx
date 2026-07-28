import { useSyncExternalStore } from "react";
import type { BarkHudState } from "../dialogue/bark-hud-state";
import type { DialogueHudState } from "../dialogue/dialogue-hud-state";
import type { HealthBarHudState } from "../health/health-bar-hud-state";
import type { InteractHintHudState } from "../interaction/interact-hint-hud-state";
import type { QuestMarkerHudState } from "../quest/quest-marker-hud-state";
import type { EmotionIconHudState } from "../reaction/emotion-icon-hud-state";
import type { GameUiActions } from "./game-ui-actions";
import type { GameUiState } from "./game-ui-state";
import type { HudState } from "./hud-state";
import { MainMenu } from "./main-menu";
import { PauseMenu } from "./pause-menu";
import { PlayingHud } from "./playing-hud";
import { ScreenFade } from "./screen-fade";
import type { SkipHintState } from "./skip-hint-state";
import { Toast } from "./toast";

export type GameUiProps = Readonly<{
	state: GameUiState;
	actions: GameUiActions;
	hud: HudState;
	dialogue: DialogueHudState;
	barks: BarkHudState;
	healthBars: HealthBarHudState;
	interactHint: InteractHintHudState;
	questMarkers: QuestMarkerHudState;
	emotionIcons: EmotionIconHudState;
	skipHint: SkipHintState;
}>;

export const GameUI = ({
	state,
	actions,
	hud,
	dialogue,
	barks,
	healthBars,
	interactHint,
	questMarkers,
	emotionIcons,
	skipHint,
}: GameUiProps) => {
	const snap = useSyncExternalStore(
		state.subscribe,
		state.getSnapshot,
	);
	return (
		<>
			{snap.phase === "playing" && (
				<PlayingHud
					hud={hud}
					dialogue={dialogue}
					barks={barks}
					healthBars={healthBars}
					interactHint={interactHint}
					questMarkers={questMarkers}
					emotionIcons={emotionIcons}
					skipHint={skipHint}
				/>
			)}
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
