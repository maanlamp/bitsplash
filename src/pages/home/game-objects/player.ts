import { Game, GameObject } from "lib/game";
import { gravity } from "lib/gravity";
import { combat, healthbar, HealthyObject, respawn } from "lib/health";
import { movement, MovingComponent } from "lib/movement";
import { physics, PhysicsObject } from "lib/physics";
import { spritesheet, SpritesheetObject } from "lib/spritesheet";

const player = (
	game: Game,
	gamepad: Gamepad
): GameObject<any> &
	PhysicsObject &
	MovingComponent &
	HealthyObject &
	SpritesheetObject => ({
	id: crypto.randomUUID(),
	components: [
		movement(game),
		healthbar(game),
		combat(game),
		respawn(5000)(game),
		spritesheet(game),
		physics(game),
		gravity(game),
	],
	position: [0, 0],
	force: [0, 0],
	mass: 1,
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
	frames: { run: { frames: 3, speed: 0.2 } },
});

export default player;
