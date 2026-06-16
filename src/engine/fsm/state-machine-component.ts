import type { Seconds } from "../duration";
import { skip } from "../serialization/field-enums";
import { serializable } from "../serialization/serializable";
import type { Params } from "./conditions";
import type { StateMachineDef } from "./state-machine";

@serializable("StateMachine")
export class StateMachineComponent {
	@skip() def: StateMachineDef | null;

	defId: string;
	@skip() current: string;
	@skip() elapsed: Seconds;
	@skip() params: Params;

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
