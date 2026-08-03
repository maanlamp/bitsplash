import { Timeline } from "../../engine/animation/timeline";
import type { Seconds } from "../../engine/duration";
import Vector2 from "../../engine/vector2";

/**
 * A damage number arcing above the entity that took the hit: text, its launch
 * arc, and the clock that ends it.
 *
 * The hitsplat owns its own {@link position} instead of riding a
 * `TransformComponent`, and that is structural rather than stylistic. This
 * component is deliberately not `@serializable`, so an entity carrying nothing
 * else is invisible to `serializeWorld` and drops out of a runtime snapshot
 * whole. Pair it with a serializable transform and capture writes half a
 * hitsplat, which thaws as an entity no system owns — an immortal
 * transform-only orphan, one per hit, forever. Keep transient effect entities
 * whole-or-nothing.
 */
export class HitsplatComponent {
	text: string;
	flavour: string | null;
	crit: boolean;
	incoming: boolean;
	position: Vector2;
	velocity: Vector2;
	/** Age countdown; the hitsplat is destroyed once it is `done()`. */
	life: Timeline;

	constructor(
		text: string = "",
		flavour: string | null = null,
		crit: boolean = false,
		incoming: boolean = false,
		position: Vector2 = Vector2.zero(),
		velocity: Vector2 = Vector2.zero(),
		lifetime: Seconds = 0.9 as Seconds,
	) {
		this.text = text;
		this.flavour = flavour;
		this.crit = crit;
		this.incoming = incoming;
		this.position = position;
		this.velocity = velocity;
		this.life = new Timeline(lifetime);
	}
}
