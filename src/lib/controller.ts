import { Component } from "lib/game";
import { getBoundingBox, PhysicsObject } from "lib/physics";
import { Mutable } from "lib/utils";
import { Vector2 } from "lib/vector";

export type ControllableObject = Readonly<{
	gamepadIndex: number;
	grounded: boolean;
}>;

export const deadzone = (deadzone: number, x: number) =>
	Math.abs(x) > deadzone ? x : 0;

// https://w3c.github.io/gamepad/standard_gamepad.svg
export const controller: Component<
	ControllableObject & PhysicsObject
> = game => {
	// TODO: Couple to self.maxJumps to allow double or triple jumping
	let releasedJump = true;
	return (self, context, delta) => {
		const gamepad = navigator.getGamepads()[self.gamepadIndex]!;
		(self.force as Mutable<Vector2>)[0] =
			self.force[0] +
			deadzone(0.5, gamepad.axes[0]) * (self.grounded ? 1 : 0.25);

		(self as Mutable<ControllableObject>).grounded = false;

		if (deadzone(0.5, gamepad.axes[0])) {
			(self as Mutable<PhysicsObject>).direction = Math.sign(gamepad.axes[0]);
		}

		const outsideBottomBounds =
			self.position[1] + self.height > context.canvas.height;
		if (outsideBottomBounds) {
			(self as Mutable<ControllableObject>).grounded = true;
		}

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
			// TODO: ledge grab?
			// const hitCorner = Math.abs(absEntryX - absEntryY) < 0.1;

			if (absEntryX <= absEntryY) {
				(self as Mutable<ControllableObject>).grounded = true;
			}
		}

		const tryingToJump = gamepad.axes[1] < -0.5;
		if (releasedJump && self.grounded && tryingToJump) {
			(self.position as Mutable<Vector2>)[1] -= self.restitution;
			(self.force as Mutable<Vector2>)[1] -= 25 * Math.abs(gamepad.axes[1]);

			releasedJump = false;
			(self as Mutable<ControllableObject>).grounded = false;
		}

		if (!releasedJump && !tryingToJump) releasedJump = true;

		// context.save();
		// context.moveTo(...add(self.position, divide([self.width, self.height], 2)));
		// context.beginPath();
		// context.lineTo(...multiply(add(self.position, self.force), 100));
		// context.closePath();
		// context.strokeStyle = "lime";
		// context.lineWidth = 2;
		// context.stroke();
		// context.restore();
	};
};
