import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { isBspriteUrl } from "./sprite-asset-cache";
import { SpriteComponent } from "./sprite-component";

/**
 * Advances `.bsprite` sprites by their manifest tags — the tag-mode counterpart
 * to {@link SpriteAnimationSystem}, which drives the legacy PNG `SpriteClip`
 * path. Each sprite is in exactly one mode, keyed on whether `urlRef` resolves
 * to a `.bsprite`; this system no-ops for legacy sprites and vice versa.
 *
 * For a `.bsprite` sprite it reads the tag named by `SpriteComponent.current`
 * and:
 *
 * - On a transition (`current !== playing`) resets to the tag's first frame,
 *   zeroes `elapsed`, clears `finished` and latches `playing = current` —
 *   mirroring {@link SpriteAnimationSystem}'s transition exactly.
 * - Advances `frame` using per-frame `frames[i].duration` **milliseconds**,
 *   accumulating `elapsed` in milliseconds (`dt` is already milliseconds — unlike
 *   the clip path, which works in seconds against a uniform fps).
 * - `frame` is the **absolute manifest frame index** (not tag-relative), so it
 *   feeds the composed-sheet layout and `bspriteSource` directly.
 * - Honors the tag's `loop` flag: looping wraps within `[from, to]`; a
 *   non-looping tag clamps at `to` and sets `finished = true` — the same
 *   contract `player-animation-system.ts` reads.
 * - A 1-frame tag (`to <= from`), a missing tag, or an unloaded/legacy asset
 *   does not animate and never divides by zero.
 */
@profiler("Sprite tag playback", "Animation")
export class SpriteTagPlaybackSystem implements UpdateSystem {
	update({ dt, ecs, assetManager }: UpdateContext): void {
		for (const [, sprite] of ecs.query(SpriteComponent)) {
			if (!isBspriteUrl(sprite.urlRef.path)) {
				continue;
			}
			const manifest = assetManager.sprites.get(
				sprite.urlRef.path,
			)?.spriteManifest;
			if (!manifest) {
				continue;
			}
			const tag = manifest.tags.find(
				(t) => t.name === sprite.current,
			);
			if (!tag) {
				continue;
			}

			if (sprite.current !== sprite.playing) {
				sprite.playing = sprite.current;
				sprite.frame = tag.from;
				sprite.elapsed = 0;
				sprite.finished = false;
			}

			if (tag.to <= tag.from) {
				continue;
			}

			sprite.elapsed += dt;
			const count = tag.to - tag.from + 1;
			for (;;) {
				const duration = manifest.frames[sprite.frame]?.duration ?? 0;
				if (duration <= 0 || sprite.elapsed < duration) {
					break;
				}
				sprite.elapsed -= duration;
				if (tag.loop) {
					sprite.frame =
						tag.from + ((sprite.frame - tag.from + 1) % count);
				} else if (sprite.frame < tag.to) {
					sprite.frame += 1;
					if (sprite.frame === tag.to) {
						sprite.finished = true;
					}
				} else {
					sprite.elapsed = 0;
					break;
				}
			}
		}
	}
}
