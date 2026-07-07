import { Duration } from "../../engine/duration";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("EnemyBrain")
export class EnemyBrainComponent {
	@serialize() attackRangeTiles: number;
	@serialize() aggroRangeTiles: number;
	@serialize() bravery: number;
	@serialize({ group: "timing" }) investigateDuration: Duration;
	@serialize({ group: "timing" }) surpriseDuration: Duration;

	prevState: string = "";

	constructor(
		attackRangeTiles: number = 1.2,
		aggroRangeTiles: number = 10,
		bravery: number = 1,
		investigateDuration: number = 3,
		surpriseDuration: number = 0.4,
	) {
		this.attackRangeTiles = attackRangeTiles;
		this.aggroRangeTiles = aggroRangeTiles;
		this.bravery = bravery;
		this.investigateDuration = new Duration(investigateDuration);
		this.surpriseDuration = new Duration(surpriseDuration);
	}
}
