import type {
	CodeCondition,
	Params,
} from "../../engine/fsm/conditions";
import { fsm, type FSM } from "../../engine/fsm/define";
import type { StateNode } from "../../engine/fsm/state-machine";

const grounded = (p: Params): boolean => p.grounded as boolean;
const onWall = (p: Params): boolean => p.onWall as boolean;
const wallJumping = (p: Params): boolean => p.wallJumping as boolean;
const landing = (p: Params): boolean => p.landing as boolean;
const dashing = (p: Params): boolean => p.dashing as boolean;
const moving = (p: Params): boolean => (p.dir as number) !== 0;
const FALL_VELOCITY = 150;
const falling = (p: Params): boolean =>
	(p.vy as number) >= FALL_VELOCITY;

const predicates: Record<string, CodeCondition> = {
	dash: (p) => dashing(p),
	idle: (p) => grounded(p) && !landing(p) && !moving(p),
	run: (p) => grounded(p) && !landing(p) && moving(p),
	land: (p) => landing(p),
	wallslide: (p) => !grounded(p) && !landing(p) && onWall(p),
	walljump: (p) =>
		!grounded(p) &&
		!landing(p) &&
		!onWall(p) &&
		wallJumping(p) &&
		!falling(p),
	jump: (p) =>
		!grounded(p) &&
		!landing(p) &&
		!onWall(p) &&
		!wallJumping(p) &&
		!falling(p),
	fall: (p) =>
		!grounded(p) && !landing(p) && !onWall(p) && falling(p),
};

const buildStates = (): Record<string, StateNode<CodeCondition>> => {
	const entries = Object.entries(predicates);
	const states: Record<string, StateNode<CodeCondition>> = {};
	for (const [name] of entries) {
		states[name] = {
			transitions: entries
				.filter(([other]) => other !== name)
				.map(([to, cond]) => ({ to, cond })),
		};
	}
	return states;
};

@fsm("player-anim")
export class PlayerAnimDef implements FSM<CodeCondition> {
	initial = "idle";
	states = buildStates();

	evaluate(cond: CodeCondition, params: Params): boolean {
		return cond(params);
	}
}
