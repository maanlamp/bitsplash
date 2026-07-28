import { useSyncExternalStore } from "react";
import type { EntityId } from "../../engine/ecs";
import { Image, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { EMOTION_ICON_SIZE } from "./emotion-icon-atlas";
import type {
	EmotionIconEntry,
	EmotionIconHudState,
} from "./emotion-icon-hud-state";

export const emotionIconNodeId = (entity: EntityId): string =>
	`emotion-${entity}`;

/** Half the icon's width, which is how far left of the head it is anchored. */
export const EMOTION_ICON_HALF_WIDTH = EMOTION_ICON_SIZE / 2;

const BOX: Style = {
	position: "absolute",
	width: EMOTION_ICON_SIZE,
	height: EMOTION_ICON_SIZE,
};

/** An `image` node has no measure function, so the crop is sized explicitly. */
const CROP: Style = {
	width: EMOTION_ICON_SIZE,
	height: EMOTION_ICON_SIZE,
};

const EmotionIcon = ({ entity, icon }: EmotionIconEntry) => (
	<View
		id={emotionIconNodeId(entity)}
		worldLayer="overlay"
		style={BOX}
	>
		{icon ? (
			<Image
				src={icon.image}
				srcX={icon.srcX}
				srcY={icon.srcY}
				srcW={icon.srcW}
				srcH={icon.srcH}
				style={CROP}
			/>
		) : null}
	</View>
);

export type EmotionIconsProps = Readonly<{
	store: EmotionIconHudState;
}>;

/**
 * The overhead emotion icons: one world-anchored node per actor currently in a
 * reaction, reconciled dynamically the way `QuestMarkers` is — a node appears
 * when its actor starts reacting and unmounts when the reaction ends.
 *
 * `EmotionIconHudSystem` positions each node through `entityTop`.
 *
 * @example
 * <EmotionIcons store={emotionIcons} />
 */
export const EmotionIcons = ({ store }: EmotionIconsProps) => {
	const entries = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	return (
		<>
			{entries.map((entry) => (
				<EmotionIcon
					key={entry.entity}
					entity={entry.entity}
					icon={entry.icon}
				/>
			))}
		</>
	);
};
