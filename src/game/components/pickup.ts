import { options } from "../../engine/serialization/field-enums";
import { serializable } from "../../engine/serialization/serializable";

export const PICKUP_TYPES = [
	"extra-jump",
	"wall-slide",
	"wall-jump",
	"speed-up",
] as const;

export type PickupType = (typeof PICKUP_TYPES)[number];

@serializable("Pickup")
export class PickupComponent {
	@options(PICKUP_TYPES)
	type: PickupType;

	constructor(type: PickupType = "extra-jump") {
		this.type = type;
	}
}
