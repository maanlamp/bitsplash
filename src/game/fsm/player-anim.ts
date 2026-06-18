import type {
	CodeCondition,
	Params,
} from "../../engine/fsm/conditions";
import { fsm, type FSM } from "../../engine/fsm/define";

const grounded = (p: Params): boolean => p.grounded as boolean;
const moving = (p: Params): boolean => (p.dir as number) !== 0;
const rising = (p: Params): boolean => (p.vy as number) < 0;

const toRun: CodeCondition = (p) => grounded(p) && moving(p);
const toIdle: CodeCondition = (p) => grounded(p) && !moving(p);
const toJump: CodeCondition = (p) => !grounded(p) && rising(p);
const toFall: CodeCondition = (p) => !grounded(p) && !rising(p);

const airborne = [
	{ to: "jump", cond: toJump, priority: 2 },
	{ to: "fall", cond: toFall, priority: 2 },
];

@fsm("player-anim")
export class PlayerAnimDef implements FSM<CodeCondition> {
	initial = "idle";

	states = {
		idle: {
			transitions: [
				...airborne,
				{ to: "run", cond: toRun, priority: 1 },
			],
		},
		run: {
			transitions: [
				...airborne,
				{ to: "idle", cond: toIdle, priority: 1 },
			],
		},
		jump: {
			transitions: [
				{ to: "fall", cond: toFall },
				{ to: "run", cond: toRun },
				{ to: "idle", cond: toIdle },
			],
		},
		fall: {
			transitions: [
				{ to: "jump", cond: toJump },
				{ to: "run", cond: toRun },
				{ to: "idle", cond: toIdle },
			],
		},
	};

	evaluate(cond: CodeCondition, params: Params): boolean {
		return cond(params);
	}
}
