import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

declare const durationBrand: unique symbol;

export type Milliseconds = number & {
	readonly [durationBrand]: "ms";
};
export type Seconds = number & { readonly [durationBrand]: "s" };

@serializable("Duration")
export class Duration implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	static zero() {
		return new Duration();
	}

	@serialize() seconds: number;

	constructor(seconds: number = 0) {
		this.seconds = seconds;
	}

	set(seconds: number): void {
		this.seconds = seconds;
	}
}
