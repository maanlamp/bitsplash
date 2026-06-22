import type { Seconds } from "../duration";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type { Params } from "./conditions";
import type { StateMachineDef } from "./state-machine";

@serializable("StateMachine")
export class StateMachineComponent {
	def: StateMachineDef | null;

	@serialize() defId: string;
	current: string;
	elapsed: Seconds;
	params: Params;

	constructor(
		def: StateMachineDef | null = null,
		defId = "",
		current = "",
		elapsed: Seconds = 0 as Seconds,
		params: Params = {},
	) {
		this.def = def;
		this.defId = defId;
		this.current = current;
		this.elapsed = elapsed;
		this.params = params;
	}
}
