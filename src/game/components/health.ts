import { serializable } from "../../engine/serialization/serializable";

@serializable("Health")
export class HealthComponent {
	hp: number;
	maxHp: number;

	constructor(hp: number = 100) {
		this.hp = hp;
		this.maxHp = hp;
	}
}
