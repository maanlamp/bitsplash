import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Health")
export class HealthComponent {
	@serialize() hp: number;
	@serialize() maxHp: number;

	constructor(maxHp: number = 100, hp = maxHp) {
		this.maxHp = maxHp;
		this.hp = hp;
	}
}
