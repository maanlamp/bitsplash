import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import Vector2 from "../../engine/vector2";

@serializable("Bow")
export class BowComponent {
	@serialize() offset: number = 10;
	@serialize() arrowSpeed: number = 360;
	@serialize() spawnDistance: number = 8;
	wasFiring: boolean = false;
	readonly renderPosition: Vector2 = new Vector2(0, 0);
	renderAngle: number = 0;
	flipX: boolean = false;
	visible: boolean = false;

	constructor(
		offset: number = 10,
		arrowSpeed: number = 360,
		spawnDistance: number = 8,
	) {
		this.offset = offset;
		this.arrowSpeed = arrowSpeed;
		this.spawnDistance = spawnDistance;
	}
}
