import type { Params } from "./conditions";
import { registerDef } from "./registry";
import type { StateMachineDef } from "./state-machine";

export type FSM<Cond = unknown> = {
	initial: string;
	states: StateMachineDef<Cond>["states"];
	anyState?: StateMachineDef<Cond>["anyState"];
	evaluate(cond: Cond, params: Params): boolean;
};

export const fsm =
	(id: string) =>
	<T extends new () => FSM>(
		ctor: T,
		_ctx: ClassDecoratorContext,
	): T => {
		registerDef(id, new ctor());
		return ctor;
	};
