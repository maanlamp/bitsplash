import { ControllableObject } from "lib/controller";
import { Game, GameObject } from "lib/game";
import { combat, die, healthbar, HealthyObject } from "lib/health";
import { PhysicsObject } from "lib/physics";
import { Vector2 } from "lib/vector";

const wall = (
	game: Game,
	position: Vector2,
	width: number,
	height: number
): GameObject<any> => ({
	id: crypto.randomUUID(),
	components: [
		healthbar(game),
		(
			self: PhysicsObject & HealthyObject & ControllableObject,
			context: CanvasRenderingContext2D,
			delta: number
		) => {
			context.save();
			context.globalAlpha = self.invincible ? 0.33 : 1;
			if (self.invincible)
				context.translate(
					self.invincible * (-1 + Math.random() * 2) * 0.03,
					self.invincible * (-1 + Math.random() * 2) * 0.03
				);
			context.strokeStyle = "black";
			context.lineWidth = 2;
			context.lineJoin = "round";
			context.strokeRect(...self.position, self.width, self.height);
			context.fillStyle = "#e9e9ec";
			context.fillRect(...self.position, self.width, self.height);
			context.restore();
		},
		combat(game),
		die(game),
	],
	position,
	force: [0, 0],
	mass: 1,
	width,
	height,
	restitution: 0.2,
	roughness: 0.1,
	static: true,
	health: 1,
});

export default wall;
