import { Component } from "lib/game";
import { Mutable } from "lib/utils";
import { add, clamp, multiply, Vector2 } from "lib/vector";

export type PhysicsObject = Readonly<{
	position: Vector2;
	force: Vector2;
	mass: number;
	width: number;
	height: number;
	static?: boolean;
	restitution: number;
	roughness: number;
	direction: number;
}>;

export const getBoundingBox = (object: PhysicsObject) => ({
	left: object.position[0],
	right: object.position[0] + object.width,
	top: object.position[1],
	bottom: object.position[1] + object.height,
	middleX: object.position[0] + object.width / 2,
	middleY: object.position[1] + object.height / 2,
});

export const physics: Component<PhysicsObject> = game => {
	const JIGGLE_THRESHOLD = 0.1;
	return (self, context, delta) => {
		if (self.static) return;

		const others: ReadonlyArray<PhysicsObject> = game.objects.filter(
			obj => obj.mass && obj !== self
		);
		for (const other of others) {
			const selfBox = getBoundingBox(self);
			const otherBox = getBoundingBox(other);
			const notCollided =
				selfBox.bottom < otherBox.top ||
				selfBox.top > otherBox.bottom ||
				selfBox.right < otherBox.left ||
				selfBox.left > otherBox.right;

			if (notCollided) continue;

			const entryX = (otherBox.middleX - selfBox.middleX) / (other.width / 2);
			const entryY = (otherBox.middleY - selfBox.middleY) / (other.height / 2);
			const absEntryX = Math.abs(entryX);
			const absEntryY = Math.abs(entryY);

			const hitDiagonal = Math.abs(absEntryX - absEntryY) < 0.05;
			const hitHorizontal = absEntryX > absEntryY;

			// Physical collisions
			if (hitDiagonal) {
				// TODO: grab ledges if falling
			} else if (hitHorizontal) {
				if (entryX < 0) {
					(self.position as Mutable<Vector2>)[0] = otherBox.right;
				} else {
					(self.position as Mutable<Vector2>)[0] = otherBox.left - self.width;
				}

				(self.force as Mutable<Vector2>)[0] = add(
					multiply(multiply(self.force, self.mass), -self.restitution),
					multiply(
						multiply(multiply(other.force, other.mass), -other.restitution),
						-1
					)
				)[0];
				if (self.force[1] > 0)
					(self.force as Mutable<Vector2>)[1] *=
						(1 + Math.max(self.roughness, other.roughness)) * 0.5;
			} else {
				if (entryY < 0) {
					(self.position as Mutable<Vector2>)[1] = otherBox.bottom;
				} else {
					(self.position as Mutable<Vector2>)[1] = otherBox.top - self.height;
				}

				(self.force as Mutable<Vector2>)[1] = add(
					multiply(multiply(self.force, self.mass), -self.restitution),
					multiply(
						multiply(multiply(other.force, other.mass), -other.restitution),
						-1
					)
				)[1];
				(self.force as Mutable<Vector2>)[0] *=
					1 - Math.max(self.roughness, other.roughness);
			}
		}

		// TODO: extract checks into named boolean variables to make more clear
		// WORLD boundaries
		// right
		if (self.position[0] + self.width > context.canvas.width) {
			(self.position as Mutable<Vector2>)[0] =
				context.canvas.width - self.width;
			if (self.force[0] > 0) {
				(self.force as Mutable<Vector2>)[0] *= -self.restitution;
				if (self.force[1] > 0) (self.force as Mutable<Vector2>)[1] *= 0.5;
			}
		}

		// bottom
		if (self.position[1] + self.height > context.canvas.height) {
			(self.position as Mutable<Vector2>)[1] =
				context.canvas.height - self.height;
			if (self.force[1] > 0) {
				(self.force as Mutable<Vector2>)[1] *= -self.restitution;
			}
			(self.force as Mutable<Vector2>)[0] *= 1 - self.roughness;
		}

		// left
		if (self.position[0] < 0) {
			(self.position as Mutable<Vector2>)[0] *= -self.restitution;
			if (self.force[0] < 0) {
				(self.force as Mutable<Vector2>)[0] *= -self.restitution;
				if (self.force[1] > 0) (self.force as Mutable<Vector2>)[1] *= 0.5;
			}
		}

		// top
		if (self.position[1] < 0) {
			(self.position as Mutable<Vector2>)[1] *= -self.restitution;
			if (self.force[1] < 0) {
				(self.force as Mutable<Vector2>)[1] *= -self.restitution;
			}
		}

		(self as Mutable<PhysicsObject>).force = clamp(
			self.force,
			game.world.terminalVelocity
		);

		// TODO: Figure out how to couple to game.timeScale
		(self as Mutable<PhysicsObject>).position = add(
			self.position,
			multiply(multiply(self.force, 1 - game.world.drag), delta * 0.1)
		);
	};
};