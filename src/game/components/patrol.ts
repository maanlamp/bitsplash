import { serializable } from "../../engine/serialization/serializable";

@serializable("Patrol")
export class PatrolComponent {
	speed: number;
	interval: number;
	direction: number;
	timer: number;

	constructor(
		speed: number = 48,
		interval: number = 1.5,
		direction: number = 1,
	) {
		this.speed = speed;
		this.interval = interval;
		this.direction = direction;
		this.timer = interval;
	}
}
