import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Chronicle")
export class ChronicleComponent {
	@serialize() flags: Record<string, string>;

	constructor(flags: Record<string, string> = {}) {
		this.flags = flags;
	}

	get(key: string): string | undefined {
		return this.flags[key];
	}

	set(key: string, value: string): void {
		this.flags[key] = value;
	}

	entries(): ReadonlyArray<readonly [string, string]> {
		return Object.entries(this.flags);
	}
}
