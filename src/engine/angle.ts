import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

@serializable("Angle")
export default class Angle implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	static zero() {
		return new Angle();
	}

	@serialize() radians: number;

	constructor(radians: number = 0) {
		this.radians = radians;
	}
}
