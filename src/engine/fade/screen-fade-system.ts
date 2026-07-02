import { Tween } from "../animation/tween";
import type { Seconds } from "../duration";
import type { ECS } from "../ecs";
import type { EffectHandle } from "../effect-handle";
import { type UpdateContext, UpdateSystem } from "../system";
import { ScreenFadeComponent } from "./screen-fade-component";

const ensureFade = (ecs: ECS): ScreenFadeComponent => {
	const entry = ecs.query(ScreenFadeComponent)[0];
	if (entry) {
		return entry[1];
	}
	const fade = new ScreenFadeComponent(0);
	ecs.createEntity([fade]);
	return fade;
};

export const startFade = (
	ecs: ECS,
	to: number,
	duration: Seconds,
	easing = "linear",
): EffectHandle => {
	const fade = ensureFade(ecs);
	const tween = new Tween(fade.alpha, to, duration, easing);
	fade.tween = tween;
	return {
		done: () => fade.tween !== tween || tween.done(),
		complete: () => {
			if (fade.tween === tween) {
				fade.alpha = to;
				fade.tween = null;
			}
		},
	};
};

export class ScreenFadeSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [, fade] of ecs.query(ScreenFadeComponent)) {
			if (!fade.tween) {
				continue;
			}
			fade.tween.tick(dt);
			fade.alpha = fade.tween.value();
			if (fade.tween.done()) {
				fade.tween = null;
			}
		}
	}
}
