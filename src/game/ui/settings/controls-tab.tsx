import type { Binding } from "../../../engine/input/bindings/action-catalog";
import {
	Text,
	View,
} from "../../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../../engine/ui/style/style";
import { HINT } from "../menu-widgets";
import { actionLabel, bindingLabel } from "./binding-label";

const column: Style = { flexDirection: "column", gap: 2 };

const row: Style = {
	flexDirection: "row",
	alignItems: "center",
	gap: 8,
	padding: 4,
	minWidth: 300,
};

const name: Style = { flexGrow: 1, color: [0.85, 0.85, 0.9, 1] };

const keys: Style = {
	textAlign: "right",
	color: [0.72, 0.72, 0.8, 1],
};

const groupByAction = (
	bindings: ReadonlyArray<Binding>,
): ReadonlyArray<Readonly<[string, ReadonlyArray<Binding>]>> => {
	const grouped = new Map<string, Binding[]>();
	for (const binding of bindings) {
		const list = grouped.get(binding.action);
		if (list) {
			list.push(binding);
		} else {
			grouped.set(binding.action, [binding]);
		}
	}
	return [...grouped];
};

export type ControlsTabProps = Readonly<{
	bindings: ReadonlyArray<Binding>;
}>;

/**
 * What each action is currently bound to. Read-only: rebinding is a capture
 * flow of its own and is not part of this view yet.
 */
export const ControlsTab = ({ bindings }: ControlsTabProps) => (
	<View style={column}>
		{groupByAction(bindings).map(([action, list]) => (
			<View key={action} style={row}>
				<Text style={name}>{actionLabel(action)}</Text>
				<Text style={keys}>{list.map(bindingLabel).join(", ")}</Text>
			</View>
		))}
		<Text style={HINT}>Rebinding is not available yet.</Text>
	</View>
);
