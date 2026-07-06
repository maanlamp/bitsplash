import { Percent } from "../../engine/percent";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("DamageStats")
export class DamageStatsComponent {
	@serialize() base: number;
	@serialize({ group: "crit" }) critChance: Percent;
	@serialize({ group: "crit" }) critMultiplier: number;
	@serialize() flavourSet: string;

	constructor(
		base: number = 25,
		critChance: number = 0,
		critMultiplier: number = 2,
		flavourSet: string = "default",
	) {
		this.base = base;
		this.critChance = new Percent(critChance);
		this.critMultiplier = critMultiplier;
		this.flavourSet = flavourSet;
	}
}
