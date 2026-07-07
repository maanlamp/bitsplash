import { Duration } from "../../engine/duration";
import { Percent } from "../../engine/percent";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tilemap/tile";

@serializable("PlayerInput")
export class PlayerInputComponent {
	@serialize() maxSpeed: number;
	@serialize({ group: "accel" }) acceleration: number;
	@serialize({ group: "accel" }) deceleration: number;
	@serialize() airControl: Percent;
	@serialize({ group: "jump" }) maxJumpSpeed: number;
	@serialize({ group: "jump" }) minJumpSpeed: number;
	@serialize({ group: "jump" }) airJumpSpeed: number;
	@serialize() maxJumps: number;
	@serialize() wallSlideSpeed: number = 2 * TILE_SIZE;
	@serialize({ group: "abilities" }) canWallSlide: boolean = false;
	@serialize({ group: "abilities" }) canWallJump: boolean = false;
	@serialize({ group: "abilities" }) canDash: boolean = false;
	@serialize({ group: "dash" }) dashSpeed: number = 9 * TILE_SIZE;
	@serialize({ group: "dash" }) dashDuration: Duration = new Duration(
		0.15,
	);
	@serialize({ group: "dash" }) dashCooldown: Duration = new Duration(
		0.5,
	);

	moveDir: number = 0;
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
		this.airControl = new Percent(airControl);
		this.maxJumpSpeed = maxJumpSpeed;
		this.minJumpSpeed = minJumpSpeed;
		this.airJumpSpeed = airJumpSpeed;
		this.maxJumps = maxJumps;
		this.jumpsRemaining = maxJumps;
	}
}
