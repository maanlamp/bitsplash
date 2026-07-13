import { useSyncExternalStore } from "react";
import type { EntityId } from "../../engine/ecs";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { HealthBarHudState } from "./health-bar-hud-state";

export const healthNodeId = (entity: EntityId): string =>
	`health-${entity}`;

const CONTAINER: Style = { position: "absolute" };
const BG: Style = {
	position: "absolute",
	left: -17,
	top: -1,
	width: 34,
	height: 6,
};
const DISPLAYED: Style = {
	position: "absolute",
	left: -16,
	top: 0,
	width: 32,
	height: 4,
	backgroundColor: [1, 1, 1, 0.7],
};
const ACTUAL: Style = {
	position: "absolute",
	left: -16,
	top: 0,
	width: 32,
	height: 4,
};

const HealthBar = ({ entity }: { entity: EntityId }) => {
	const base = healthNodeId(entity);
	return (
		<View id={base} worldLayer="terrain" style={CONTAINER}>
			<View id={`${base}-bg`} style={BG} />
			<View id={`${base}-displayed`} style={DISPLAYED} />
			<View id={`${base}-actual`} style={ACTUAL} />
		</View>
	);
};

export type HealthBarsProps = Readonly<{
	store: HealthBarHudState;
}>;

export const HealthBars = ({ store }: HealthBarsProps) => {
	const ids = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	return (
		<>
			{ids.map((id) => (
				<HealthBar key={id} entity={id} />
			))}
		</>
	);
};
