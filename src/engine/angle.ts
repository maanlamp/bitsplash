import { valueType } from "./serialization/value-type";

@valueType()
export default class Angle {
	static zero() {
		return new Angle();
	}

	constructor(public radians: number = 0) {}
}
