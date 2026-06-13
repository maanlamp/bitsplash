import type {
	CodeCondition,
	Params,
} from "../../engine/fsm/conditions";
import { fsm, type FSM } from "../../engine/fsm/define";

@fsm("patrol")
export class PatrolDef implements FSM<CodeCondition> {
	initial = "right";

	states = {
		right: {
			transitions: [
				{
					to: "left",
					cond: (p: Params) =>
						(p.elapsed as number) >= (p.interval as number),
				},
			],
		},
		left: {
			transitions: [
				{
					to: "right",
					cond: (p: Params) =>
						(p.elapsed as number) >= (p.interval as number),
				},
			],
		},
	};

	evaluate(cond: CodeCondition, params: Params): boolean {
		return cond(params);
	}
}
