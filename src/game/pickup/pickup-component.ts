import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

export const PICKUP_TYPES = [
	"extra-jump",
	"wall-slide",
	"wall-jump",
	"speed-up",
] as const;

export type PickupType = (typeof PICKUP_TYPES)[number];

@serializable("Pickup")
export class PickupComponent {
	@serialize({ options: PICKUP_TYPES })
	type: PickupType;

	constructor(type: PickupType = "extra-jump") {
		this.type = type;
	}
}
