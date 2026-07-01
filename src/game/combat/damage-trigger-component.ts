import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("DamageTrigger")
export class DamageTriggerComponent {
	@serialize() amount: number;

	constructor(amount: number = 25) {
		this.amount = amount;
	}
}
