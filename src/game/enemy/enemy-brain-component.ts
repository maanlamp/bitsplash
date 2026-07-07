import { Duration } from "../../engine/duration";
import { MachineState } from "../../engine/fsm/machine-state";
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
	@serialize({ group: "timing" }) provokeDuration: Duration;

	@serialize() machine: MachineState = new MachineState("patrol", 0);

	entered: string[] = [];
	exited: string[] = [];

	constructor(
		attackRangeTiles: number = 1.2,
		aggroRangeTiles: number = 10,
		bravery: number = 1,
		investigateDuration: number = 3,
		surpriseDuration: number = 0.4,
		provokeDuration: number = 5,
	) {
		this.attackRangeTiles = attackRangeTiles;
		this.aggroRangeTiles = aggroRangeTiles;
		this.bravery = bravery;
		this.investigateDuration = new Duration(investigateDuration);
		this.surpriseDuration = new Duration(surpriseDuration);
		this.provokeDuration = new Duration(provokeDuration);
	}
}
