import { ControllableObject, controller } from "lib/controller";
import { Game, GameObject } from "lib/game";
import { gravity } from "lib/gravity";
import { physics, PhysicsObject } from "lib/physics";

const player = (
	game: Game,
	gamepad: Gamepad
): GameObject<any> & PhysicsObject & ControllableObject => ({
	id: crypto.randomUUID(),
	components: [
		(self: PhysicsObject, context: CanvasRenderingContext2D, delta: number) => {
			context.save();
			context.strokeStyle = "black";
			context.lineWidth = 2;
			context.lineJoin = "round";
			context.strokeRect(...self.position, self.width, self.height);
			context.fillStyle = "red";
			context.fillRect(...self.position, self.width, self.height);
			context.restore();
		},
		physics(game),
		controller(game),
		gravity(game),
	],
	position: [0, 0],
	force: [0, 0],
	mass: 1,
	width: 16,
	height: 16,
	gamepadIndex: gamepad.index,
	restitution: 0.2,
	roughness: 0.1,
	grounded: false,
	onWall: false,
	maxJumps: 2,
});

export default player;
