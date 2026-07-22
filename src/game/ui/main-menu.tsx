import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { GameUiActions } from "./game-ui-actions";
import type { GameUiSnapshot } from "./game-ui-state";
import { MenuButton, OVERLAY, PANEL, TITLE } from "./menu-widgets";
import { SaveList } from "./save-list";

export type MainMenuProps = Readonly<{
	snap: GameUiSnapshot;
	actions: GameUiActions;
}>;

export const MainMenu = ({ snap, actions }: MainMenuProps) => {
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
	const hasSaves = snap.saves.length > 0;
	return (
		<View style={OVERLAY}>
			<View style={PANEL}>
				<Text style={TITLE}>Fantasy Platformer</Text>
				<MenuButton label="New Game" onActivate={actions.newGame} />
				<MenuButton
					label="Continue"
					disabled={!hasSaves || snap.busy}
					onActivate={actions.continueLatest}
				/>
				<MenuButton
					label="Load"
					disabled={!hasSaves}
					onActivate={actions.openLoad}
				/>
			</View>
		</View>
	);
};
