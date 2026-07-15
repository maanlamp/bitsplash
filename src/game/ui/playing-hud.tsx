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
import type { HudState } from "./hud-state";
import { ScreenFade } from "./screen-fade";
import { SkipHint } from "./skip-hint";
import type { SkipHintState } from "./skip-hint-state";

export type PlayingHudProps = Readonly<{
	hud: HudState;
	dialogue: DialogueHudState;
	healthBars: HealthBarHudState;
	interactHint: InteractHintHudState;
	questMarkers: QuestMarkerHudState;
	skipHint: SkipHintState;
}>;

export const PlayingHud = ({
	hud,
	dialogue,
	healthBars,
	interactHint,
	questMarkers,
	skipHint,
}: PlayingHudProps) => (
	<>
		<HealthBars store={healthBars} />
		<Hitsplats />
		<QuestMarkers store={questMarkers} />
		<InteractHint store={interactHint} />
		<GameHud hud={hud} />
		<DialogueHud store={dialogue} />
		<SkipHint store={skipHint} />
	</>
);

export const PlaytestHud = (props: PlayingHudProps) => (
	<>
		<PlayingHud {...props} />
		<ScreenFade />
	</>
);
