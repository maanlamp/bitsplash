import { useSyncExternalStore } from "react";
import { Overlay } from "../../engine/ui/components/overlay";
import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { UI_FONT } from "../dialogue/dialogue-ui";
import { KeyCap } from "./key-cap";
import type { SkipHintState } from "./skip-hint-state";

export const SKIP_HINT_ID = "skip-hint";
export const SKIP_KEYCAP_ID = "skip-keycap";

const LABEL: Style = {
	color: [1, 1, 1, 1],
	textOutline: [0, 0, 0, 1],
	font: UI_FONT,
	marginRight: 4,
};

export type SkipHintProps = Readonly<{ store: SkipHintState }>;

export const SkipHint = ({ store }: SkipHintProps) => {
	const snap = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	if (!snap.open) {
		return null;
	}
	return (
		<Overlay
			id={SKIP_HINT_ID}
			style={{
				flexDirection: "column",
				justifyContent: "flex-end",
				alignItems: "flex-end",
				padding: 8,
				pointerEvents: "none",
			}}
		>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				<Text style={LABEL}>Skip</Text>
				<KeyCap
					glyph={snap.glyph}
					activation={snap.activation}
					icon={snap.icon}
					id={SKIP_KEYCAP_ID}
					frame={snap.frame}
					insets={snap.insets}
					font={UI_FONT}
				/>
			</View>
		</Overlay>
	);
};
