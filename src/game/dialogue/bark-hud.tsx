import { useSyncExternalStore } from "react";
import type { EntityId } from "../../engine/ecs";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import type { BarkHudState, BarkView } from "./bark-hud-state";
import { BubbleTailDown } from "./bubble-tail-down";
import { BUBBLE_MAX_TEXT_WIDTH } from "./conversation-view";
import { SpeechBubble } from "./speech-bubble";

/** Node id of one entity's bark bubble, so a system can place it by id. */
export const barkNodeId = (entity: EntityId): string =>
	`bark-${entity}`;

/**
 * How many bark-layout pixels stand in for one conversation-panel pixel.
 *
 * A bark is world-anchored, so it is drawn in the world pass and every layout
 * pixel becomes `cameraZoom` screen pixels; the conversation panel is drawn in
 * the UI pass, where a layout pixel becomes `uiScale` screen pixels. Laying the
 * bark out at `uiScale / cameraZoom` makes the two read at the same apparent
 * size for any pair of values — the game currently runs zoom 3 against
 * `uiScale` 3, and nothing here depends on those two staying equal.
 *
 * @example
 * const scale = barkBubbleScale(camera?.zoom ?? 1, uiScale);
 */
export const barkBubbleScale = (
	cameraZoom: number,
	uiScale: number,
): number =>
	cameraZoom > 0 && uiScale > 0 ? uiScale / cameraZoom : 1;

/**
 * The widest a bark's text may wrap to, in bark-layout pixels: the panel's own
 * maximum taken through {@link barkBubbleScale}, so barks and messages break
 * their lines at the same apparent width.
 */
export const barkWrapWidth = (scale: number): number =>
	BUBBLE_MAX_TEXT_WIDTH * scale;

/** A bark's font size at its layout scale, never below one whole pixel. */
export const barkFontSize = (
	baseSize: number,
	scale: number,
): number => Math.max(1, Math.round(baseSize * scale));

/**
 * Barks are never interactive, and `PointerRouter.hitTest` reads the unshifted
 * `layoutRect` — which for a world-anchored node sits near the screen origin —
 * so an opaque bubble would swallow clicks in a place it is not drawn.
 */
const CONTAINER: Style = {
	position: "absolute",
	flexDirection: "column",
	alignItems: "center",
	pointerEvents: "none",
};

const Bark = ({ view }: { view: BarkView }) => (
	<View
		id={barkNodeId(view.entity)}
		worldLayer="overlay"
		style={CONTAINER}
	>
		<SpeechBubble
			lines={view.lines}
			font={view.font}
			loadedFont={view.loadedFont}
			frame={view.frame}
			scale={view.scale}
		/>
		<BubbleTailDown scale={view.scale} />
	</View>
);

export type BarkHudProps = Readonly<{
	store: BarkHudState;
}>;

/**
 * One bubble per barking entity, reconciled from {@link BarkHudState}: no pool,
 * no reuse, so a bubble's measured size always belongs to the text inside it.
 *
 * The wrapper carries no size of its own — `BarkHudSystem` anchors it above the
 * speaker's head and shifts it by its own measured width and height, which is
 * what lets a bubble that wraps to two lines still sit centred and clear.
 */
export const BarkHud = ({ store }: BarkHudProps) => {
	const views = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
	);
	return (
		<>
			{views.map((view) => (
				<Bark key={view.entity} view={view} />
			))}
		</>
	);
};
