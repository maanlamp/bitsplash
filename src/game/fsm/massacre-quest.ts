import {
	type DataCondition,
	evaluateDataCondition,
	type Params,
} from "../../engine/fsm/conditions";
import { type FSM, fsm } from "../../engine/fsm/define";

@fsm("massacre-quest")
export class MassacreQuestDef implements FSM<DataCondition> {
	initial = "offered";

	states = {
		offered: {
			transitions: [{ to: "active", cond: { trigger: "active" } }],
		},
		active: {
			transitions: [{ to: "return", cond: { trigger: "return" } }],
		},
		return: {
			transitions: [
				{ to: "complete", cond: { trigger: "complete" } },
			],
		},
		complete: { transitions: [] },
	};

	evaluate(cond: DataCondition, params: Params): boolean {
		return evaluateDataCondition(cond, params);
	}
}
