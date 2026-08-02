import { useState } from "react";
import type { Binding } from "../../../engine/input/bindings/action-catalog";
import { ScrollView } from "../../../engine/ui/components/scroll-view";
import {
	Text,
	View,
} from "../../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../../engine/ui/style/style";
import { MenuButton, OVERLAY, PANEL, TITLE } from "../menu-widgets";
import { AccessibilityTab } from "./accessibility-tab";
import { AudioTab } from "./audio-tab";
import { ControlsTab } from "./controls-tab";
import {
	SETTINGS_TAB_LABELS,
	SETTINGS_TABS,
	type SettingsTab,
} from "./settings-tabs";
import { VideoTab } from "./video-tab";

const panel: Style = {
	...PANEL,
	minWidth: 340,
	maxHeight: "100%",
	flexShrink: 1,
};

const tabBar: Style = {
	flexDirection: "row",
	gap: 4,
	alignSelf: "center",
};

const tab: Style = {
	padding: 6,
	minWidth: 78,
	alignItems: "center",
	backgroundColor: [0.16, 0.16, 0.2, 1],
};

const tabActive: Style = {
	...tab,
	backgroundColor: [0.3, 0.28, 0.18, 1],
};

const tabFocused: Style = {
	...tab,
	backgroundColor: [0.42, 0.34, 0.11, 1],
};

const body: Style = { flexShrink: 1, padding: 4 };

type TabButtonProps = Readonly<{
	id: SettingsTab;
	active: boolean;
	onSelect: (id: SettingsTab) => void;
}>;

const TabButton = ({ id, active, onSelect }: TabButtonProps) => {
	const [focused, setFocused] = useState(false);
	const select = (): void => onSelect(id);
	return (
		<View
			focusable
			focusGroup="settings-tabs"
			style={focused ? tabFocused : active ? tabActive : tab}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			onClick={select}
			onConfirm={select}
		>
			<Text
				style={{
					color:
						active || focused ? [1, 1, 1, 1] : [0.7, 0.7, 0.78, 1],
				}}
			>
				{SETTINGS_TAB_LABELS[id]}
			</Text>
		</View>
	);
};

export type SettingsViewProps = Readonly<{
	bindings: ReadonlyArray<Binding>;
	onBack: () => void;
}>;

/**
 * The player-facing settings, reachable from the main menu and the pause menu
 * alike. Both entry points render this same view, so a setting changed
 * mid-session and one changed before starting are the same act.
 *
 * The tab strip is focusable like everything else here: left/right walks it,
 * hovering it focuses it, and neither switches tab. A tab switches on a click
 * or a confirm, because focus is attention and activation is a decision —
 * sweeping a mouse across the strip or passing through it on the way somewhere
 * else must not flip through four tabs.
 */
export const SettingsView = ({
	bindings,
	onBack,
}: SettingsViewProps) => {
	const [active, setActive] = useState<SettingsTab>("audio");
	return (
		<View style={OVERLAY}>
			<View style={panel} onCancel={() => onBack()}>
				<Text style={TITLE}>Settings</Text>
				<View style={tabBar}>
					{SETTINGS_TABS.map((id) => (
						<TabButton
							key={id}
							id={id}
							active={id === active}
							onSelect={setActive}
						/>
					))}
				</View>
				<ScrollView key={active} style={body}>
					{active === "audio" && <AudioTab />}
					{active === "video" && <VideoTab />}
					{active === "accessibility" && <AccessibilityTab />}
					{active === "controls" && (
						<ControlsTab bindings={bindings} />
					)}
				</ScrollView>
				<MenuButton
					label="Back"
					focusGroup="settings-back"
					onActivate={onBack}
				/>
			</View>
		</View>
	);
};
