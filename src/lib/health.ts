import fistLeftSrc from "assets/images/fist-left.png";
import fistRightSrc from "assets/images/fist-right.png";
import { ControllableObject } from "lib/controller";
import { Component, GameObject } from "lib/game";
import { getBoundingBox, PhysicsObject } from "lib/physics";
import { Mutable } from "lib/utils";
import { add } from "lib/vector";

const fistLeftImage = new Image();
fistLeftImage.src = fistLeftSrc;
const fistRightImage = new Image();
fistRightImage.src = fistRightSrc;

export type HealthyObject = Readonly<{
	health: number;
	invincible: number;
}>;

export const healthbar: Component<PhysicsObject & HealthyObject> =
	game => (self, context, delta) => {
		context.save();
		context.fillStyle = "red";
		context.fillRect(...add(self.position, [0, -10]), self.width, 4);
		context.fillStyle = "lime";
		context.fillRect(
			...add(self.position, [0, -10]),
			self.width * self.health,
			4
		);
		context.restore();
	};

export const combat: Component<
	PhysicsObject & ControllableObject & HealthyObject
> = game => {
	let attacking = false;
	let releasedAttack = true;
	let frames = 0;
	const attackWidth = 30;
	return (self, context, delta) => {
		const fps = Math.round(1000 / delta);
		const MAX_FRAMES = fps * 0.1;
		const INVINCIBLE_FRAMES = fps;
		// TODO: Extract to invincible component to prevent walls having to need a gamepad
		if (self.invincible) {
			(self as Mutable<HealthyObject>).invincible -= 1;
		}

		const gamepad = navigator.getGamepads()[self.gamepadIndex];
		if (!gamepad) return;
		const attackButton = gamepad.buttons[1];

		if (!attackButton.pressed) {
			releasedAttack = true;
		}

		if (!attacking && releasedAttack && attackButton.pressed) {
			attacking = true;
			releasedAttack = false;
		}

		if (attacking) {
			context.save();
			context.fillStyle = "black";
			context.drawImage(
				self.direction === 1 ? fistRightImage : fistLeftImage,
				self.position[0] + self.width * (self.direction > 0 ? 1 : 0),
				self.position[1],
				attackWidth *
					(Math.min(frames, MAX_FRAMES / 3) / (MAX_FRAMES / 3)) *
					self.direction,
				self.height
			);
			context.restore();

			if (frames >= MAX_FRAMES) {
				attacking = false;
				frames = 0;
			}

			const others: ReadonlyArray<GameObject<HealthyObject & PhysicsObject>> =
				game.objects.filter(
					obj => obj.health !== undefined && obj.position && obj !== self
				);
			for (const other of others) {
				if (other.invincible) continue;

				const selfBox = getBoundingBox(self);
				const otherBox = getBoundingBox(other);

				const facingRight = self.direction === 1;
				const intersectY =
					otherBox.top <= selfBox.top && otherBox.bottom >= selfBox.bottom;
				const intersectX =
					(facingRight &&
						otherBox.left <= selfBox.right + attackWidth &&
						otherBox.right >= selfBox.right + attackWidth) ||
					(!facingRight &&
						otherBox.right >= selfBox.left - attackWidth &&
						otherBox.left <= selfBox.left - attackWidth);

				if (intersectY && intersectX) {
					(other as Mutable<HealthyObject>).invincible = INVINCIBLE_FRAMES;
					(other as Mutable<HealthyObject>).health -= 0.1;
				}
			}

			frames += 1;
		}
	};
};

export const respawn =
	(ms: number): Component<HealthyObject> =>
	game =>
	(self, context, delta) => {
		const dead = self.health <= 0.001;
		if (dead) {
			const index = game.objects.findIndex(x => x === self);
			game.objects.splice(index, 1);
			(self as Mutable<HealthyObject>).health = 1;
			(self as Mutable<HealthyObject>).invincible = 0;
			setTimeout(() => {
				game.objects.push(self);
			}, ms);
		}
	};

export const die: Component<HealthyObject> = game => (self, context, delta) => {
	const dead = self.health <= 0.001;
	if (dead) {
		const index = game.objects.findIndex(x => x === self);
		game.objects.splice(index, 1);
	}
};
