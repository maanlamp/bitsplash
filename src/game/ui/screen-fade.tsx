import { Overlay } from "../../engine/ui/components/overlay";

export const SCREEN_FADE_ID = "screen-fade";

export const ScreenFade = () => (
	<Overlay
		id={SCREEN_FADE_ID}
		alpha={0}
		style={{ backgroundColor: [0, 0, 0, 1], pointerEvents: "none" }}
	/>
);
