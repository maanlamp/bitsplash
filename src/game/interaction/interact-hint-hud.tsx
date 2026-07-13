import { useSyncExternalStore } from "react";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { KeyCap } from "../ui/key-cap";
import type { InteractHintHudState } from "./interact-hint-hud-state";

export const INTERACT_HINT_ID = "interact-hint";

export const HINT_HALF_WIDTH = 20;

const CONTAINER: Style = {
	position: "absolute",
	width: HINT_HALF_WIDTH * 2,
	height: 16,
	flexDirection: "row",
	justifyContent: "center",
	alignItems: "center",
};

export type InteractHintProps = Readonly<{
	store: InteractHintHudState;
}>;

export const InteractHint = ({ store }: InteractHintProps) => {
	const snap = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	if (snap.entity === null || snap.glyph.length === 0) {
		return null;
	}
	return (
		<View
			id={INTERACT_HINT_ID}
			worldLayer="overlay"
			style={CONTAINER}
		>
			<KeyCap
				glyph={snap.glyph}
				font={snap.font ?? undefined}
				frame={snap.frame}
				insets={snap.insets}
				icon={snap.icon}
				activation={snap.activation}
			/>
		</View>
	);
};
