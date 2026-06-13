import { serializable } from "../../engine/serialization/serializable";

@serializable("Health")
export class HealthComponent {
	hp: number;
	maxHp: number;

	constructor(hp: number = 100, maxHp = hp) {
		this.hp = hp;
		this.maxHp = maxHp;
	}
}
