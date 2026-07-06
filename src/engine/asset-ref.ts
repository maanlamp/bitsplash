import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

@serializable("AssetRef")
export class AssetRef implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() path: string;
	accept: string;

	constructor(accept: string = "*/*", path: string = "") {
		this.accept = accept;
		this.path = path;
	}

	set(path: string): void {
		this.path = path;
	}
}
