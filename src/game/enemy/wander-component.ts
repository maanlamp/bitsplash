import { Timeline } from "../../engine/animation/timeline";
import { Duration } from "../../engine/duration";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import type Vector2 from "../../engine/vector2";

@serializable("Wander")
export class WanderComponent {
	@serialize() radiusTiles: number;
	@serialize({ group: "interval" }) minInterval: Duration;
	@serialize({ group: "interval" }) maxInterval: Duration;

	@serialize() origin: Vector2 | null = null;
	/**
	 * Idle dwell before the next destination is picked, retimed to a fresh
	 * random draw between {@link minInterval} and {@link maxInterval} each time
	 * it runs out.
	 */
	dwell = new Timeline();

	constructor(
		radiusTiles: number = 8,
		minInterval: number = 2,
		maxInterval: number = 4,
	) {
		this.radiusTiles = radiusTiles;
		this.minInterval = new Duration(minInterval);
		this.maxInterval = new Duration(maxInterval);
	}
}
