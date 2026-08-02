import { useState } from "react";
import { playerSettings } from "../../../engine/settings/player-settings";
import { ScrollView } from "../../../engine/ui/components/scroll-view";
import {
	Text,
	View,
} from "../../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../../engine/ui/style/style";
import {
	HINT,
	MenuButton,
	OVERLAY,
	PANEL,
	TITLE,
} from "../menu-widgets";
import { ACCESSIBILITY_ITEMS } from "./accessibility-items";
import { usePlayerSetting } from "./use-player-setting";

const PANEL_WIDTH = 340;
const PANEL_PADDING = 12;

const panel: Style = {
	...PANEL,
	width: PANEL_WIDTH,
	maxWidth: "100%",
	maxHeight: "100%",
	padding: PANEL_PADDING,
	gap: 8,
};

/**
 * Bounded to the panel's content box so the copy wraps inside it. Text measures
 * its natural width when nothing constrains it, which for a paragraph is the
 * whole paragraph on one line.
 */
const detail: Style = {
	color: [0.7, 0.7, 0.78, 1],
	maxWidth: PANEL_WIDTH - PANEL_PADDING * 2,
	padding: 4,
};

const detailBox: Style = { flexShrink: 1 };

const buttons: Style = {
	flexDirection: "row",
	gap: 6,
	alignSelf: "center",
};

export type FirstLaunchPassProps = Readonly<{
	onDone: () => void;
}>;

/**
 * The pass a player walks before their first game: every accessibility setting,
 * one at a time, each either changed or explicitly skipped.
 *
 * This is how consent is obtained before exposure to flashing and shake, and it
 * is deliberately not a health warning with a dismiss button. There is nothing
 * to dismiss — the only ways past an item are to set it or to press Skip, and
 * the only way past the pass is to reach the end of it. `Next` stays inert
 * until the value actually moves, so the two are never the same press by
 * accident.
 *
 * Everything here is reachable again from Settings → Accessibility afterwards.
 */
export const FirstLaunchPass = ({ onDone }: FirstLaunchPassProps) => {
	const [index, setIndex] = useState(0);
	const item = ACCESSIBILITY_ITEMS[index];
	const [opened, setOpened] = useState(() => item?.read() ?? 0);
	const current = usePlayerSetting(() => item?.read() ?? 0);

	if (!item) {
		return null;
	}

	const advance = (): void => {
		const next = index + 1;
		const following = ACCESSIBILITY_ITEMS[next];
		if (!following) {
			playerSettings.setAccessibilitySeen(true);
			onDone();
			return;
		}
		setIndex(next);
		setOpened(following.read());
	};

	const changed = current !== opened;
	return (
		<View style={OVERLAY}>
			<View style={panel}>
				<Text style={TITLE}>Before you play</Text>
				<Text style={HINT}>
					{`${index + 1} of ${ACCESSIBILITY_ITEMS.length} · change it or skip it`}
				</Text>
				<Text style={{ ...TITLE, alignSelf: "flex-start" }}>
					{item.title}
				</Text>
				<ScrollView style={detailBox}>
					<Text style={detail}>{item.detail}</Text>
				</ScrollView>
				<item.Control />
				<View style={buttons}>
					<MenuButton
						label="Skip this"
						focusGroup="first-launch"
						onActivate={advance}
					/>
					<MenuButton
						label={
							index === ACCESSIBILITY_ITEMS.length - 1
								? "Done"
								: "Next"
						}
						focusGroup="first-launch"
						disabled={!changed}
						onActivate={advance}
					/>
				</View>
			</View>
		</View>
	);
};
