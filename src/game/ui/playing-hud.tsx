import { BarkHud } from "../dialogue/bark-hud";
import type { BarkHudState } from "../dialogue/bark-hud-state";
import { DialogueAdvanceHint } from "../dialogue/dialogue-advance-hint";
import { DialogueHud } from "../dialogue/dialogue-hud";
import type { DialogueHudState } from "../dialogue/dialogue-hud-state";
import { DpsMeters } from "../dps-meter/dps-meter-hud";
import { HealthBars } from "../health/health-bar-hud";
import type { HealthBarHudState } from "../health/health-bar-hud-state";
import { Hitsplats } from "../hitsplat/hitsplat-hud";
import { InteractHint } from "../interaction/interact-hint-hud";
import type { InteractHintHudState } from "../interaction/interact-hint-hud-state";
import { QuestMarkers } from "../quest/quest-marker-hud";
import type { QuestMarkerHudState } from "../quest/quest-marker-hud-state";
import { EmotionIcons } from "../reaction/emotion-icon-hud";
import type { EmotionIconHudState } from "../reaction/emotion-icon-hud-state";
import { GameHud } from "./game-hud";
import { HintRow } from "./hint-row";
import type { HudState } from "./hud-state";
import { ScreenFade } from "./screen-fade";
import { SkipHint } from "./skip-hint";
import type { SkipHintState } from "./skip-hint-state";

export type PlayingHudProps = Readonly<{
	hud: HudState;
	dialogue: DialogueHudState;
	barks: BarkHudState;
	healthBars: HealthBarHudState;
	interactHint: InteractHintHudState;
	questMarkers: QuestMarkerHudState;
	emotionIcons: EmotionIconHudState;
	skipHint: SkipHintState;
}>;

export const PlayingHud = ({
	hud,
	dialogue,
	barks,
	healthBars,
	interactHint,
	questMarkers,
	emotionIcons,
	skipHint,
}: PlayingHudProps) => (
	<>
		<HealthBars store={healthBars} />
		<DpsMeters />
		<Hitsplats />
		<BarkHud store={barks} />
		<QuestMarkers store={questMarkers} />
		<EmotionIcons store={emotionIcons} />
		<InteractHint store={interactHint} />
		<GameHud hud={hud} />
		<DialogueHud store={dialogue} />
		<HintRow>
			<DialogueAdvanceHint store={dialogue} />
			<SkipHint store={skipHint} />
		</HintRow>
	</>
);

export const PlaytestHud = (props: PlayingHudProps) => (
	<>
		<PlayingHud {...props} />
		<ScreenFade />
	</>
);
