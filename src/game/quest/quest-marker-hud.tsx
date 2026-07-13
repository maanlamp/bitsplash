import { useSyncExternalStore } from "react";
import type { EntityId } from "../../engine/ecs";
import type { ColorInput } from "../../engine/render/color-resolver";
import { Line, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { QuestMarkerHudState } from "./quest-marker-hud-state";

export const markerNodeId = (entity: EntityId): string =>
	`marker-${entity}`;

const HALF_WIDTH = 5;
const HEIGHT = 6;
const FILL: ColorInput = [1, 0.85, 0.4, 1];
const OUTLINE: ColorInput = [0, 0, 0, 1];

const CONTAINER: Style = { position: "absolute" };
const LINE: Style = { position: "absolute" };

// Chevron pointing down at the entity: apex at the container origin (0,0),
// base corners HEIGHT above it. Outline (thick, black) then fill (thin, gold).
const chevron = (color: ColorInput, width: number) => (
	<>
		<Line
			style={LINE}
			x1={-HALF_WIDTH}
			y1={-HEIGHT}
			x2={0}
			y2={0}
			color={color}
			width={width}
		/>
		<Line
			style={LINE}
			x1={HALF_WIDTH}
			y1={-HEIGHT}
			x2={0}
			y2={0}
			color={color}
			width={width}
		/>
	</>
);

const QuestMarker = ({ entity }: { entity: EntityId }) => (
	<View
		id={markerNodeId(entity)}
		worldLayer="overlay"
		style={CONTAINER}
	>
		{chevron(OUTLINE, 4)}
		{chevron(FILL, 2)}
	</View>
);

export type QuestMarkersProps = Readonly<{
	store: QuestMarkerHudState;
}>;

export const QuestMarkers = ({ store }: QuestMarkersProps) => {
	const ids = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	return (
		<>
			{ids.map((id) => (
				<QuestMarker key={id} entity={id} />
			))}
		</>
	);
};
