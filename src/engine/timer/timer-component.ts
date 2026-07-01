import type { Seconds } from "../duration";

export class TimerComponent {
	remaining: Seconds;
	event: object;

	constructor(remaining: Seconds, event: object) {
		this.remaining = remaining;
		this.event = event;
	}
}
