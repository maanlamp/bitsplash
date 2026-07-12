import type { Seconds } from "../duration";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type { ValueType } from "../serialization/serializable-value";

@serializable("Timer")
export class TimerComponent {
	@serialize() remaining: Seconds;
	@serialize() event: ValueType | null;

	constructor(
		remaining: Seconds = 0 as Seconds,
		event: ValueType | null = null,
	) {
		this.remaining = remaining;
		this.event = event;
	}
}
