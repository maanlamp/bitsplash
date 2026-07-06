import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Health")
export class HealthComponent {
	@serialize({ group: "hp" }) hp: number;
	@serialize({ group: "hp" }) maxHp: number;

	constructor(maxHp: number = 100, hp = maxHp) {
		this.maxHp = maxHp;
		this.hp = hp;
	}
}
