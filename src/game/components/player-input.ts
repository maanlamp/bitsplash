import { serializable } from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tile";

@serializable("PlayerInput")
export class PlayerInputComponent {
	maxSpeed: number;
	acceleration: number;
	deceleration: number;
	airControl: number;
	maxJumpSpeed: number;
	minJumpSpeed: number;
	airJumpSpeed: number;
	maxJumps: number;
	wallSlideSpeed: number = 2 * TILE_SIZE;
	canWallSlide: boolean = false;
	canWallJump: boolean = false;

	constructor(
		maxSpeed: number = 3 * TILE_SIZE,
		acceleration: number = 80 * TILE_SIZE,
		deceleration: number = 100 * TILE_SIZE,
		airControl: number = 0.3,
		maxJumpSpeed: number = 10 * TILE_SIZE,
		minJumpSpeed: number = 5 * TILE_SIZE,
		airJumpSpeed: number = 7 * TILE_SIZE,
		maxJumps: number = 1,
	) {
		this.maxSpeed = maxSpeed;
		this.acceleration = acceleration;
		this.deceleration = deceleration;
		this.airControl = airControl;
		this.maxJumpSpeed = maxJumpSpeed;
		this.minJumpSpeed = minJumpSpeed;
		this.airJumpSpeed = airJumpSpeed;
		this.maxJumps = maxJumps;
	}
}
