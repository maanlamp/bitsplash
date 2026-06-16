import type { Seconds } from "../../engine/duration";

export class HealthBarStateComponent {
	displayed: number;
	lastHp: number;
	delay = 0 as Seconds;
	visible = 0 as Seconds;

	constructor(hp: number) {
		this.displayed = hp;
		this.lastHp = hp;
	}
}
