import { SpriteComponent } from "../components/sprite";
import { type UpdateContext, UpdateSystem } from "../system";

export class SpriteAnimationSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [, sprite] of ecs.query(SpriteComponent)) {
			const clip = sprite.clips[sprite.current];
			if (!clip) {
				continue;
			}

			if (sprite.current !== sprite.playing) {
				sprite.playing = sprite.current;
				sprite.frame = 0;
				sprite.elapsed = 0;
				sprite.finished = false;
			}

			if (clip.fps <= 0 || clip.frameCount <= 1) {
				continue;
			}

			sprite.elapsed += dt / 1000;
			const frameDuration = 1 / clip.fps;
			while (sprite.elapsed >= frameDuration) {
				sprite.elapsed -= frameDuration;
				if (clip.loop) {
					sprite.frame = (sprite.frame + 1) % clip.frameCount;
				} else {
					sprite.frame = Math.min(
						sprite.frame + 1,
						clip.frameCount - 1,
					);
					if (sprite.frame === clip.frameCount - 1) {
						sprite.finished = true;
					}
				}
			}
		}
	}
}
