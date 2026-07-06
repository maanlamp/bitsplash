import { ColorResolver, type RGBA } from "./render/color-resolver";
import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

const resolver = new ColorResolver();

@serializable("Color")
export class Color implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	private _css: string = "oklch(0 0 0)";
	private cached: RGBA | null = null;

	constructor(css: string = "oklch(0 0 0)") {
		this._css = css;
	}

	@serialize() get css(): string {
		return this._css;
	}

	set css(css: string) {
		this._css = css;
		this.cached = null;
	}

	get rgba(): RGBA {
		return (this.cached ??= resolver.resolve(this._css));
	}

	set(css: string): void {
		this.css = css;
	}
}
