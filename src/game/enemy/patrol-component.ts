import { Duration } from "../../engine/duration";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Patrol")
export class PatrolComponent {
	@serialize({ group: "move" }) speed: number;
	@serialize({ group: "move" }) interval: Duration;
	@serialize({
		options: [
			{ label: "Left", value: -1 },
			{ label: "Right", value: 1 },
		],
	})
	direction: number;

	constructor(
		speed: number = 48,
		interval: number = 1.5,
		direction: number = 1,
	) {
		this.speed = speed;
		this.interval = new Duration(interval);
		this.direction = direction;
	}
}
