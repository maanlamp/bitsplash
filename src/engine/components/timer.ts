export class TimerComponent {
	remaining: number;
	event: object;

	constructor(remaining: number, event: object) {
		this.remaining = remaining;
		this.event = event;
	}
}
