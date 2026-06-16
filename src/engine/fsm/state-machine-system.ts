import type { Seconds } from "../duration";
import { type UpdateContext, UpdateSystem } from "../system";
import type { Params } from "./conditions";
import { StateEnterEvent, StateExitEvent } from "./events";
import { getDef } from "./registry";
import type { StateMachineDef, Transition } from "./state-machine";
import { StateMachineComponent } from "./state-machine-component";

export class StateMachineSystem extends UpdateSystem {
	update({ dt, ecs, events }: UpdateContext): void {
		for (const [id, sm] of ecs.query(StateMachineComponent)) {
			if (!sm.def) {
				if (!sm.defId) {
					continue;
				}
				sm.def = getDef(sm.defId);
				sm.current ||= sm.def.initial;
			}

			const def = sm.def;

			sm.elapsed = (sm.elapsed + dt / 1000) as Seconds;

			const currentNode = def.states[sm.current];
			if (!currentNode) {
				continue;
			}

			const params: Params = { ...sm.params, elapsed: sm.elapsed };

			const candidates: Transition<unknown>[] = [
				...(def.anyState ?? []),
				...currentNode.transitions,
			].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

			for (const transition of candidates) {
				if (!def.evaluate(transition.cond, params)) {
					continue;
				}

				events.emit(new StateExitEvent(id, sm.current));
				sm.current = transition.to;
				sm.elapsed = 0 as Seconds;
				events.emit(new StateEnterEvent(id, sm.current));

				consumeTriggers(transition.cond, def, sm.params);

				break;
			}
		}
	}
}

const consumeTriggers = (
	cond: unknown,
	_def: StateMachineDef,
	params: Params,
): void => {
	if (
		typeof cond === "object" &&
		cond !== null &&
		"trigger" in cond &&
		typeof (cond as { trigger: unknown }).trigger === "string"
	) {
		params[(cond as { trigger: string }).trigger] = false;
	}
};
