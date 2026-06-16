import type { Seconds } from "../../engine/duration";
import { serializable } from "../../engine/serialization/serializable";

@serializable("Patrol")
export class PatrolComponent {
	speed: number;
	interval: Seconds;
	direction: number;

	constructor(
		speed: number = 48,
		interval: Seconds = 1.5 as Seconds,
		direction: number = 1,
	) {
		this.speed = speed;
		this.interval = interval;
		this.direction = direction;
	}
}
