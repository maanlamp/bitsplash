import type { Seconds } from "../duration";
import type Vector2 from "../vector2";
import type { CameraTransitionMode } from "./camera-transition-component";

export type Framing = Readonly<{
	zoom: number;
	mode?: CameraTransitionMode;
	duration?: Seconds;
	follow?: boolean;
	offsetTiles?: Vector2;
}>;
