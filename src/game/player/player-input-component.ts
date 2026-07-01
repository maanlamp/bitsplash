import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tilemap/tile";

@serializable("PlayerInput")
export class PlayerInputComponent {
	@serialize() maxSpeed: number;
	@serialize() acceleration: number;
	@serialize() deceleration: number;
	@serialize() airControl: number;
	@serialize() maxJumpSpeed: number;
	@serialize() minJumpSpeed: number;
	@serialize() airJumpSpeed: number;
	@serialize() maxJumps: number;
	@serialize() wallSlideSpeed: number = 2 * TILE_SIZE;
	@serialize() canWallSlide: boolean = false;
	@serialize() canWallJump: boolean = false;
	@serialize() dashSpeed: number = 9 * TILE_SIZE;
	@serialize() dashDuration: number = 150;
	@serialize() dashCooldown: number = 500;

	moveDir: number = 0;
	facing: number = 1;
	grounded: boolean = false;
	jumping: boolean = false;
	jumpWasHeld: boolean = false;
	onWall: boolean = false;
	wallJumping: boolean = false;
	landing: boolean = false;
	canLand: boolean = true;
	jumpsRemaining: number = 0;
	dashing: boolean = false;
	dashWasHeld: boolean = false;
	dashDir: number = 1;
	dashTimeRemaining: number = 0;
	dashCooldownRemaining: number = 0;

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
		this.jumpsRemaining = maxJumps;
	}
}
