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

	origin: Vector2 | null = null;
	elapsed: number = 0;
	nextAt: number = 0;

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
