import { serializable } from "../../engine/serialization/serializable";

@serializable("Health")
export class HealthComponent {
	hp: number;
	maxHp: number;

	constructor(maxHp: number = 100, hp = maxHp) {
		this.maxHp = maxHp;
		this.hp = hp;
	}
}
