import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("DamageStats")
export class DamageStatsComponent {
	@serialize() base: number;
	@serialize() critChance: number;
	@serialize() critMultiplier: number;
	@serialize() flavourSet: string;

	constructor(
		base: number = 25,
		critChance: number = 0,
		critMultiplier: number = 2,
		flavourSet: string = "default",
	) {
		this.base = base;
		this.critChance = critChance;
		this.critMultiplier = critMultiplier;
		this.flavourSet = flavourSet;
	}
}
