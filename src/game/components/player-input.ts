import { serializable } from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tile";

export type PlayerMovementConfig = Readonly<{
	maxSpeed: number;
	acceleration: number;
	deceleration: number;
	airControl: number;
	maxJumpSpeed: number;
	minJumpSpeed: number;
	airJumpSpeed: number;
	maxJumps: number;
}>;

const DEFAULT_PLAYER_MOVEMENT: PlayerMovementConfig = {
	maxSpeed: 3 * TILE_SIZE,
	acceleration: 80 * TILE_SIZE,
	deceleration: 100 * TILE_SIZE,
	airControl: 0.3,
	maxJumpSpeed: 10 * TILE_SIZE,
	minJumpSpeed: 5 * TILE_SIZE,
	airJumpSpeed: 7 * TILE_SIZE,
	maxJumps: 1,
};

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
		config: PlayerMovementConfig = DEFAULT_PLAYER_MOVEMENT,
	) {
		this.maxSpeed = config.maxSpeed;
		this.acceleration = config.acceleration;
		this.deceleration = config.deceleration;
		this.airControl = config.airControl;
		this.maxJumpSpeed = config.maxJumpSpeed;
		this.minJumpSpeed = config.minJumpSpeed;
		this.airJumpSpeed = config.airJumpSpeed;
		this.maxJumps = config.maxJumps;
	}
}
