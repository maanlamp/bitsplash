import {
	Text,
	View,
} from "../../../engine/ui/reconciler/ui-elements";
import { HINT } from "../menu-widgets";
import { WeatherQualityControl } from "./accessibility-items";

const column = { flexDirection: "column", gap: 4 } as const;

/**
 * Weather quality is the one video setting the engine has. It is the same
 * control the Accessibility tab carries — one stored value, reachable from
 * whichever tab a player thinks to look in.
 */
export const VideoTab = () => (
	<View style={column}>
		<WeatherQualityControl />
		<Text style={HINT}>
			Resolution and display mode follow the game window.
		</Text>
	</View>
);
