import type { StateMachineDef } from "./state-machine";

const registry = new Map<string, StateMachineDef<unknown>>();

export const registerDef = <Cond>(
	id: string,
	def: StateMachineDef<Cond>,
): void => {
	if (registry.has(id)) {
		console.warn(`[FSM] Overwriting existing def "${id}"`);
	}
	registry.set(id, def as StateMachineDef<unknown>);
};

export const getDef = (id: string): StateMachineDef<unknown> => {
	const def = registry.get(id);
	if (!def) {
		throw new Error(`[FSM] No def registered for id "${id}"`);
	}
	return def;
};
