import { Duration } from "../../engine/duration";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

export type MeleePhase = "idle" | "windup" | "recover";

@serializable("Melee")
export class MeleeComponent {
	@serialize() rangeTiles: number;
	@serialize() knockback: number;
	@serialize({ group: "timing" }) windup: Duration;
	@serialize({ group: "timing" }) recover: Duration;

	phase: MeleePhase = "idle";
	elapsed: number = 0;
	triggered: boolean = false;

	constructor(
		rangeTiles: number = 1.5,
		knockback: number = 180,
		windup: number = 0.4,
		recover: number = 0.6,
	) {
		this.rangeTiles = rangeTiles;
		this.knockback = knockback;
		this.windup = new Duration(windup);
		this.recover = new Duration(recover);
	}
}
