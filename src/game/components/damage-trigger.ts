import { serializable } from "../../engine/serialization/serializable";

@serializable("DamageTrigger")
export class DamageTriggerComponent {
	amount: number;

	constructor(amount: number = 25) {
		this.amount = amount;
	}
}
