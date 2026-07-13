import { Fragment } from "react";
import { Text } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";

export const HITSPLAT_POOL_SIZE = 24;

export const hitsplatMainId = (slot: number): string =>
	`hitsplat-${slot}`;
export const hitsplatFlavourId = (slot: number): string =>
	`hitsplat-flavour-${slot}`;

const SLOT: Style = {
	position: "absolute",
	textAlign: "center",
	textOutline: [0.1, 0.1, 0.1, 1],
};

// A fixed pool of text nodes (rendered once, never reconciled). The
// per-frame system maps active hitsplats to slots and drives text / scale /
// color / world position / alpha / visibility through the dyn store.
export const Hitsplats = () => (
	<>
		{Array.from({ length: HITSPLAT_POOL_SIZE }, (_unused, slot) => (
			<Fragment key={slot}>
				<Text
					id={hitsplatMainId(slot)}
					worldLayer="terrain"
					style={SLOT}
				/>
				<Text
					id={hitsplatFlavourId(slot)}
					worldLayer="terrain"
					style={SLOT}
				/>
			</Fragment>
		))}
	</>
);
