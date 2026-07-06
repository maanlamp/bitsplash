import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

@serializable("Percent")
export class Percent implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	static zero() {
		return new Percent();
	}

	@serialize() value: number;

	constructor(value: number = 0) {
		this.value = value;
	}

	set(value: number): void {
		this.value = value;
	}
}
