import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { GameUiActions } from "./game-ui-actions";
import type { GameUiSnapshot } from "./game-ui-state";
import {
	HINT,
	MenuButton,
	OVERLAY,
	PANEL,
	TITLE,
} from "./menu-widgets";
import { SaveList } from "./save-list";
import { SettingsView } from "./settings/settings-view";

export type PauseMenuProps = Readonly<{
	snap: GameUiSnapshot;
	actions: GameUiActions;
}>;

export const PauseMenu = ({ snap, actions }: PauseMenuProps) => {
	if (snap.view === "settings") {
		return (
			<SettingsView
				bindings={snap.bindings}
				onBack={actions.closeSettings}
			/>
		);
	}
	if (snap.view === "load") {
		return (
			<SaveList
				title="Load game"
				saves={snap.saves}
				onLoad={actions.loadSlot}
				onDelete={actions.deleteSlot}
				onBack={actions.closeLoad}
			/>
		);
	}
	return (
		<View style={OVERLAY}>
			<View style={PANEL} onCancel={() => actions.resume()}>
				<Text style={TITLE}>Paused</Text>
				<MenuButton label="Resume" onActivate={actions.resume} />
				<MenuButton
					label="Save"
					disabled={snap.busy}
					onActivate={actions.saveGame}
				/>
				<MenuButton label="Load" onActivate={actions.openLoad} />
				<MenuButton
					label="Settings"
					onActivate={actions.openSettings}
				/>
				<MenuButton label="Quit to menu" onActivate={actions.quit} />
				<Text style={HINT}>
					Esc pause · F5 quicksave · F9 quickload
				</Text>
			</View>
		</View>
	);
};
