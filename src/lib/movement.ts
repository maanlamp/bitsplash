import { Component } from "lib/game";
import { HealthyObject } from "lib/health";
import { getBoundingBox, PhysicsObject } from "lib/physics";
import { Mutable } from "lib/utils";
import { Vector2 } from "lib/vector";

export type MovingComponent = Readonly<{
	gamepadIndex: number;
	grounded: boolean;
	onWall: boolean;
}>;

export const deadzone = (deadzone: number, x: number) =>
	Math.abs(x) > deadzone ? x : 0;

// https://w3c.github.io/gamepad/standard_gamepad.svg
export const movement: Component<
	MovingComponent & PhysicsObject & Partial<HealthyObject>
> = game => {
	// TODO: Couple to self.maxJumps to allow double or triple jumping
	// TODO: different masses fuck up the controls and physics
	let releasedJump = true;
	let grounded = false;
	let onWall = false;

	return (self, context, delta) => {
		const gamepad = navigator.getGamepads()[self.gamepadIndex]!;

		if (!self.attacking) {
			(self.force as Mutable<Vector2>)[0] =
				self.force[0] + deadzone(0.5, gamepad.axes[0]) * (grounded ? 1 : 0.25);

			if (deadzone(0.5, gamepad.axes[0])) {
				(self as Mutable<PhysicsObject>).direction = Math.sign(gamepad.axes[0]);
				onWall = false;
			}
		}

		const outsideBottomBounds =
			self.position[1] + self.height >= context.canvas.height;
		const outsideHorizontalBounds =
			self.position[0] < 0 ||
			self.position[0] + self.width > context.canvas.width - 0;
		if (outsideBottomBounds) {
			grounded = true;
		} else if (outsideHorizontalBounds) {
			onWall = true;
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

			if (absEntryX < absEntryY) {
				if (entryY >= 0) grounded = true;
			} else {
				onWall = true;
			}
		}

		const tryingToJump = gamepad.buttons[3].pressed;
		if (releasedJump && (grounded || onWall) && tryingToJump) {
			if (onWall) {
				(self.position as Mutable<Vector2>)[0] -= self.restitution;
				(self.force as Mutable<Vector2>)[0] = self.direction === -1 ? 2 : -2;
				(self.force as Mutable<Vector2>)[1] = -15;
				// TODO: Jump off walls
			} else {
				(self.position as Mutable<Vector2>)[1] -= self.restitution;
				(self.force as Mutable<Vector2>)[1] = -25;
			}

			releasedJump = false;
			grounded = false;
			onWall = false;
		}

		if (!releasedJump && !tryingToJump) releasedJump = true;

		(self as Mutable<MovingComponent>).grounded = grounded;
		(self as Mutable<MovingComponent>).onWall = onWall;
	};
};
