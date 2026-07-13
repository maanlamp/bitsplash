import doubleTapUrl from "../content/assets/marker-double-tap.png";
import holdUrl from "../content/assets/marker-hold.png";
import toggleUrl from "../content/assets/marker-toggle.png";
import type { ActivationMarker } from "./key-cap";

export const ACTIVATION_MARKER_URL: Partial<
	Record<ActivationMarker, string>
> = {
	hold: holdUrl,
	toggle: toggleUrl,
	doubleTap: doubleTapUrl,
};
