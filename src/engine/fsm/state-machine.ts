import type { Params } from "./conditions";

export type Transition<Cond> = {
	to: string;
	cond: Cond;
	priority?: number;
};

export type StateNode<Cond> = {
	transitions: Transition<Cond>[];
};

export type StateMachineDef<Cond = unknown> = {
	initial: string;
	states: Record<string, StateNode<Cond>>;
	anyState?: Transition<Cond>[];
	evaluate: (cond: Cond, params: Params) => boolean;
};
