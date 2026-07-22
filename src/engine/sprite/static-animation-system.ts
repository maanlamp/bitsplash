import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { SpriteComponent } from "./sprite-component";
import { StaticAnimationComponent } from "./static-animation-component";

/**
 * Drives {@link StaticAnimationComponent}: for every entity that pairs one with a
 * {@link SpriteComponent}, it pins `sprite.current` to the component's `tag` so
 * {@link import("./sprite-tag-playback-system").SpriteTagPlaybackSystem} loops
 * that tag. Runs *before* tag playback in the update order, so the tag is set
 * for the frame in which playback advances it.
 *
 * This is the minimal way to make a decorative prop animate: no facing, no
 * intent, no physics — the entity stays static while a single named tag plays.
 */
@profiler("Static animation", "Animation")
export class StaticAnimationSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, anim, sprite] of ecs.query(
			StaticAnimationComponent,
			SpriteComponent,
		)) {
			sprite.current = anim.tag;
		}
	}
}
