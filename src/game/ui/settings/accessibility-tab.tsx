import { View } from "../../../engine/ui/reconciler/ui-elements";
import { ACCESSIBILITY_ITEMS } from "./accessibility-items";

const column = { flexDirection: "column", gap: 4 } as const;

/**
 * Every accessibility setting, stacked. Same list the first-launch pass walks —
 * this is where a player comes back to change what they chose there.
 */
export const AccessibilityTab = () => (
	<View style={column}>
		{ACCESSIBILITY_ITEMS.map((item) => (
			<item.Control key={item.id} />
		))}
	</View>
);
