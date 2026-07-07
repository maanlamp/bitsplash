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
const PURSUE_GIVEUP = 3;

const num = (p: Params, key: string): number => p[key] as number;
const bool = (p: Params, key: string): boolean => p[key] as boolean;

const detection = (p: Params): number => num(p, "detection");
const seen = (p: Params): boolean => bool(p, "seen");
const provoked = (p: Params): boolean => bool(p, "provoked");
const engaged = (p: Params): boolean => bool(p, "engaged");
const inAttackRange = (p: Params): boolean =>
	bool(p, "inAttackRange");
const leftTerritory = (p: Params): boolean =>
	bool(p, "leftTerritory");
const unreachableTarget = (p: Params): boolean =>
	bool(p, "unreachableTarget");
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
			{ to: "surprised", cond: (p) => seen(p) },
			{
				to: "search",
				cond: (p) => detection(p) >= SUSPICION && !seen(p),
			},
		],
	},
	surprised: {
		transitions: [
			{
				to: "chase",
				cond: (p) => num(p, "elapsed") >= num(p, "surpriseDuration"),
			},
		],
	},
	chase: {
		transitions: [
			{ to: "attack", cond: (p) => inAttackRange(p) },
			{ to: "retreat", cond: (p) => unreachableTarget(p) },
			{ to: "patrol", cond: (p) => !seen(p) && leftTerritory(p) },
			{
				to: "search",
				cond: (p) =>
					!seen(p) &&
					(reachedGoal(p) ||
						num(p, "timeSinceSeen") >= PURSUE_GIVEUP),
			},
		],
	},
	attack: {
		transitions: [{ to: "chase", cond: (p) => !inAttackRange(p) }],
	},
	search: {
		transitions: [
			{ to: "attack", cond: (p) => inAttackRange(p) },
			{ to: "chase", cond: (p) => engaged(p) },
			{
				to: "patrol",
				cond: (p) => num(p, "elapsed") >= num(p, "searchDuration"),
			},
		],
	},
	retreat: {
		transitions: [
			{ to: "attack", cond: (p) => inAttackRange(p) },
			{
				to: "chase",
				cond: (p) => engaged(p) && !unreachableTarget(p),
			},
			{ to: "patrol", cond: (p) => !provoked(p) && !seen(p) },
			{
				to: "patrol",
				cond: (p) => num(p, "elapsed") >= num(p, "searchDuration"),
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
