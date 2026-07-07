import { Percent } from "../percent";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { TILE_SIZE } from "../tilemap/tile";

@serializable("Locomotion")
export class LocomotionComponent {
	@serialize() maxSpeed: number;
	@serialize({ group: "accel" }) acceleration: number;
	@serialize({ group: "accel" }) deceleration: number;
	@serialize() airControl: Percent;
	@serialize({ group: "jump" }) jumpSpeed: number;

	grounded: boolean = false;

	constructor(
		maxSpeed: number = 3 * TILE_SIZE,
		acceleration: number = 80 * TILE_SIZE,
		deceleration: number = 100 * TILE_SIZE,
		airControl: number = 0.3,
		jumpSpeed: number = 10 * TILE_SIZE,
	) {
		this.maxSpeed = maxSpeed;
		this.acceleration = acceleration;
		this.deceleration = deceleration;
		this.airControl = new Percent(airControl);
		this.jumpSpeed = jumpSpeed;
	}
}
