import type {
	CodeCondition,
	Params,
} from "../../engine/fsm/conditions";
import { fsm, type FSM } from "../../engine/fsm/define";
import type {
	StateNode,
	Transition,
} from "../../engine/fsm/state-machine";

const SUSPICION = 0.5;
const PURSUE_TIMEOUT = 6;

const num = (p: Params, key: string): number => p[key] as number;
const bool = (p: Params, key: string): boolean => p[key] as boolean;

const detection = (p: Params): number => num(p, "detection");
const aware = (p: Params): boolean => bool(p, "aware");
const inAttackRange = (p: Params): boolean =>
	bool(p, "inAttackRange");
const inTerritory = (p: Params): boolean => bool(p, "inTerritory");
const leftTerritory = (p: Params): boolean =>
	bool(p, "leftTerritory");
const reachedGoal = (p: Params): boolean => bool(p, "reachedGoal");
const state = (p: Params): string => p.state as string;

const anyState: Transition<CodeCondition>[] = [
	{
		to: "flee",
		priority: 100,
		cond: (p) =>
			bool(p, "lowNerve") &&
			!bool(p, "forgotten") &&
			state(p) !== "flee",
	},
	{
		to: "patrol",
		priority: 90,
		cond: (p) =>
			bool(p, "targetDead") &&
			state(p) !== "patrol" &&
			state(p) !== "flee",
	},
];

const states: Record<string, StateNode<CodeCondition>> = {
	patrol: {
		transitions: [
			{ to: "surprised", cond: (p) => aware(p) },
			{
				to: "investigate",
				cond: (p) => detection(p) >= SUSPICION && !aware(p),
			},
		],
	},
	surprised: {
		transitions: [
			{
				to: "chase",
				cond: (p) =>
					num(p, "elapsed") >= num(p, "surpriseDuration") &&
					inTerritory(p),
			},
			{
				to: "stare",
				cond: (p) =>
					num(p, "elapsed") >= num(p, "surpriseDuration") &&
					aware(p) &&
					!inTerritory(p),
			},
			{
				to: "patrol",
				cond: (p) =>
					num(p, "elapsed") >= num(p, "surpriseDuration") &&
					!aware(p),
			},
		],
	},
	stare: {
		transitions: [
			{ to: "chase", cond: (p) => inTerritory(p) },
			{ to: "investigate", cond: (p) => !aware(p) },
		],
	},
	chase: {
		transitions: [
			{ to: "attack", cond: (p) => aware(p) && inAttackRange(p) },
			{ to: "stare", cond: (p) => aware(p) && leftTerritory(p) },
			{
				to: "investigate",
				cond: (p) =>
					!aware(p) &&
					(reachedGoal(p) ||
						num(p, "timeSinceSeen") >= PURSUE_TIMEOUT),
			},
		],
	},
	attack: {
		transitions: [
			{
				to: "chase",
				cond: (p) => !inAttackRange(p) || !aware(p),
			},
		],
	},
	investigate: {
		transitions: [
			{ to: "chase", cond: (p) => inTerritory(p) },
			{ to: "stare", cond: (p) => aware(p) && !inTerritory(p) },
			{
				to: "patrol",
				cond: (p) =>
					num(p, "elapsed") >= num(p, "investigateDuration"),
			},
		],
	},
	flee: {
		transitions: [
			{ to: "patrol", cond: (p) => bool(p, "forgotten") },
		],
	},
};

@fsm("enemy-brain")
export class EnemyBrainDef implements FSM<CodeCondition> {
	initial = "patrol";
	states = states;
	anyState = anyState;

	evaluate(cond: CodeCondition, params: Params): boolean {
		return cond(params);
	}
}
