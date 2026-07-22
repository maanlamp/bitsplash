import {
	serializable,
	serialize,
} from "../serialization/serializable";

/**
 * Marks a static entity as a decorative animated prop: it has no gameplay
 * behaviour, but its {@link import("./sprite-component").SpriteComponent} should
 * continuously play one named tag from its `.bsprite`. {@link
 * import("./static-animation-system").StaticAnimationSystem} pins
 * `sprite.current` to {@link tag} every frame so {@link
 * import("./sprite-tag-playback-system").SpriteTagPlaybackSystem} loops it,
 * without turning the entity into a physics-driven actor.
 *
 * @example
 * // A dialogue prop that idles forever:
 * { Sprite: { urlRef: { path: "…/player.bsprite" } }, StaticAnimation: { tag: "idle" } }
 */
@serializable("StaticAnimation")
export class StaticAnimationComponent {
	@serialize() tag: string = "";

	constructor(tag: string = "") {
		this.tag = tag;
	}
}
