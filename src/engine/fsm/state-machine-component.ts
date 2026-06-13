import { serializable } from "../serialization/serializable";
import type { Params } from "./conditions";
import type { StateMachineDef } from "./state-machine";

@serializable("StateMachine")
export class StateMachineComponent {
	// Not serialized: class instance, skipped by encodeValue.
	def: StateMachineDef | null;

	// Serialized: runtime state.
	defId: string;
	current: string;
	elapsed: number;
	params: Params;

	constructor(
		def: StateMachineDef | null = null,
		defId = "",
		current = "",
		elapsed = 0,
		params: Params = {},
	) {
		this.def = def;
		this.defId = defId;
		this.current = current;
		this.elapsed = elapsed;
		this.params = params;
	}
}
