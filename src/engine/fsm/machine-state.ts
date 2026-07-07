import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

@serializable("MachineState")
export class MachineState implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() current: string;
	@serialize() elapsed: number;

	constructor(current = "", elapsed = 0) {
		this.current = current;
		this.elapsed = elapsed;
	}
}
