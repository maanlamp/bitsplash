import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { TRACKER_FONT } from "./hud-fonts";

const CONTAINER: Style = {
	position: "absolute",
	top: 8,
	right: 8,
	flexDirection: "column",
	alignItems: "flex-end",
	pointerEvents: "none",
};

const LINE: Style = {
	color: [1, 1, 1, 1],
	textOutline: [0, 0, 0, 1],
	font: TRACKER_FONT,
};

export type QuestTrackerProps = Readonly<{
	lines: readonly string[];
}>;

export const QuestTracker = ({ lines }: QuestTrackerProps) => {
	if (lines.length === 0) {
		return null;
	}
	return (
		<View style={CONTAINER}>
			{lines.map((line, index) => (
				<Text key={index} style={LINE}>
					{line}
				</Text>
			))}
		</View>
	);
};
