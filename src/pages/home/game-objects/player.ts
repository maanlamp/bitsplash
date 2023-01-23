import { ControllableObject, controller } from "lib/controller";
import { Game, GameObject } from "lib/game";
import { gravity } from "lib/gravity";
import { combat, healthbar, HealthyObject, respawn } from "lib/health";
import { physics, PhysicsObject } from "lib/physics";
import { spritesheet, SpritesheetObject } from "lib/spritesheet";

let i = 0;

const player = (
	game: Game,
	gamepad: Gamepad
): GameObject<any> &
	PhysicsObject &
	ControllableObject &
	HealthyObject &
	SpritesheetObject => ({
	id: crypto.randomUUID(),
	components: [
		controller(game),
		healthbar(game),
		combat(game),
		respawn(5000)(game),
		spritesheet(game),
		physics(game),
		gravity(game),
	],
	position: [i * 200, 0],
	force: [0, 0],
	mass: 1 + i++,
	width: 64,
	height: 64,
	gamepadIndex: gamepad.index,
	restitution: 0.2,
	roughness: 0.1,
	grounded: false,
	onWall: false,
	maxJumps: 2,
	health: 1,
	invincible: 0,
	direction: 1,
	attacking: false,
	src: "assets/images/player-atlas.png",
	animationState: "idle",
});

export default player;
