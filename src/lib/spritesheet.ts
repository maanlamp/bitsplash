import { Component } from "lib/game";
import { HealthyObject } from "lib/health";
import { deadzone, MovingComponent } from "lib/movement";
import { PhysicsObject } from "lib/physics";
import { Mutable } from "lib/utils";

export type AnimationState =
	| "idle"
	| "attack"
	| "duck"
	| "wallglide"
	| "run"
	| "stop"
	| "jump"
	| "fall";

export type SpritesheetObject = Readonly<{
	src: string;
	animationState: AnimationState;
	frames?: Partial<
		Record<AnimationState, Readonly<{ frames: number; speed: number }>>
	>;
}>;

export const spritesheet: Component<
	SpritesheetObject & PhysicsObject & MovingComponent & HealthyObject
> = game => {
	let animationFrame = 0;
	const atlas = new Image();
	return (self, context, delta) => {
		if (!atlas.src) {
			atlas.src = new URL("../" + self.src, import.meta.url).href;
		}

		const gamepad = navigator.getGamepads()[self.gamepadIndex]!;

		const prevState = self.animationState;

		if (self.attacking) {
			(self as Mutable<SpritesheetObject>).animationState = "attack";
		} else if (self.force[1] < -5) {
			(self as Mutable<SpritesheetObject>).animationState = "jump";
		} else if (self.force[1] > 5) {
			(self as Mutable<SpritesheetObject>).animationState = "fall";
		} else if (self.onWall) {
			(self as Mutable<SpritesheetObject>).animationState = "wallglide";
		} else if (self.grounded && deadzone(0.5, gamepad.axes[0])) {
			(self as Mutable<SpritesheetObject>).animationState = "run";
		} else if (
			self.grounded &&
			((self.force[0] > 1 && self.direction === 1) ||
				(self.force[0] < -1 && self.direction === -1))
		) {
			(self as Mutable<SpritesheetObject>).animationState = "stop";
		} else {
			(self as Mutable<SpritesheetObject>).animationState = "idle";
		}

		if (prevState !== self.animationState) {
			animationFrame = 0;
		}

		context.save();
		context.translate(...self.position);
		if (self.direction === -1) {
			context.scale(-1, 1);
			context.translate(-self.width, 0);
		}
		switch (self.animationState) {
			case "idle": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 128 * Math.floor(animationFrame),
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			case "attack": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 1,
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			case "wallglide": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 3,
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			case "run": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 4,
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			case "stop": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 5,
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			case "jump": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 6,
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			case "fall": {
				context.drawImage(
					atlas,
					128 * Math.floor(animationFrame),
					128 * 7,
					128,
					128,
					0,
					0,
					self.width,
					self.height
				);
				break;
			}
			default:
				throw `Unknown animation state "${self.animationState}".`;
		}
		context.restore();

		animationFrame =
			(animationFrame + (self.frames?.[self.animationState]?.speed ?? 1)) %
			(self.frames?.[self.animationState]?.frames ?? 1);
	};
};
