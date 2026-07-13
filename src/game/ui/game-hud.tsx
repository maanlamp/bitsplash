import { useSyncExternalStore } from "react";
import { Banner } from "./banner";
import { DEATH_FONT, NOTICE_FONT } from "./hud-fonts";
import type { HudState } from "./hud-state";
import { QuestTracker } from "./quest-tracker";

export const DEATH_OVERLAY_ID = "death-overlay";
export const QUEST_NOTICE_ID = "quest-notice";

const DEATH_COLOR: [number, number, number, number] = [1, 0, 0, 1];
const NOTICE_COLOR: [number, number, number, number] = [
	1, 0.85, 0.4, 1,
];

export type GameHudProps = Readonly<{
	hud: HudState;
}>;

export const GameHud = ({ hud }: GameHudProps) => {
	const snap = useSyncExternalStore(hud.subscribe, hud.getSnapshot);
	return (
		<>
			<QuestTracker lines={snap.questLines} />
			{snap.notice !== null && (
				<Banner
					id={QUEST_NOTICE_ID}
					text={snap.notice}
					color={NOTICE_COLOR}
					font={NOTICE_FONT}
					place="third"
				/>
			)}
			<Banner
				id={DEATH_OVERLAY_ID}
				text="You died"
				color={DEATH_COLOR}
				font={DEATH_FONT}
				place="center"
			/>
		</>
	);
};
