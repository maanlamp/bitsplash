import { FontSettings } from "../../engine/text/font-settings";
import { Text } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import meterFont from "../content/assets/comicoro.font.zip?url";

/**
 * Meters drawn at once. Small on purpose: a DPS readout is a training-dummy
 * affordance, not something every damageable entity carries.
 */
export const DPS_METER_POOL_SIZE = 4;

export const dpsMeterNodeId = (slot: number): string =>
	`dps-meter-${slot}`;

const SLOT: Style = {
	position: "absolute",
	textAlign: "center",
	textOutline: [0.1, 0.1, 0.1, 1],
	color: [1, 0.94, 0.78, 1],
	font: new FontSettings(meterFont, 16),
};

// A fixed pool of text nodes (rendered once, never reconciled). The per-frame
// system maps entities carrying a DpsMeterComponent to slots and drives text /
// alpha / world position / visibility through the dyn store.
export const DpsMeters = () => (
	<>
		{Array.from({ length: DPS_METER_POOL_SIZE }, (_unused, slot) => (
			<Text
				key={slot}
				id={dpsMeterNodeId(slot)}
				worldLayer="terrain"
				style={SLOT}
			/>
		))}
	</>
);
