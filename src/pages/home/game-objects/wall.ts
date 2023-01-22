import { GameObject } from "lib/game";
import { PhysicsObject } from "lib/physics";
import { Vector2 } from "lib/vector";

const wall = (
	position: Vector2,
	width: number,
	height: number
): GameObject<any> & PhysicsObject => ({
	id: crypto.randomUUID(),
	components: [
		(self: PhysicsObject, context: CanvasRenderingContext2D, delta: number) => {
			context.save();
			context.strokeStyle = "black";
			context.lineWidth = 2;
			context.lineJoin = "round";
			context.strokeRect(...self.position, self.width, self.height);
			context.fillStyle = "#e9e9ec";
			context.fillRect(...self.position, self.width, self.height);
			context.restore();
		},
	],
	position,
	force: [0, 0],
	mass: 1,
	width,
	height,
	restitution: 0.2,
	roughness: 0.1,
	static: true,
});

export default wall;
