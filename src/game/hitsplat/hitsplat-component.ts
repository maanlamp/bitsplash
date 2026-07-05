import type { Seconds } from "../../engine/duration";
import Vector2 from "../../engine/vector2";

export class HitsplatComponent {
	text: string;
	flavour: string | null;
	crit: boolean;
	incoming: boolean;
	velocity: Vector2;
	age: Seconds;
	lifetime: Seconds;

	constructor(
		text: string = "",
		flavour: string | null = null,
		crit: boolean = false,
		incoming: boolean = false,
		velocity: Vector2 = Vector2.zero(),
		lifetime: Seconds = 0.9 as Seconds,
	) {
		this.text = text;
		this.flavour = flavour;
		this.crit = crit;
		this.incoming = incoming;
		this.velocity = velocity;
		this.age = 0 as Seconds;
		this.lifetime = lifetime;
	}
}
