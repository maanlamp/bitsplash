import { defineMachine } from "../../engine/fsm/machine";

const FALL_VELOCITY = 150;

export type AnimCtx = {
	grounded: boolean;
	onWall: boolean;
	wallJumping: boolean;
	landing: boolean;
	dashing: boolean;
	dir: number;
	vy: number;
};

const falling = (c: AnimCtx): boolean => c.vy >= FALL_VELOCITY;

export type AnimState =
	| "dash"
	| "idle"
	| "run"
	| "land"
	| "wallslide"
	| "walljump"
	| "jump"
	| "fall";

export const playerAnimMachine = defineMachine<AnimCtx>()({
	initial: "idle",
	root: [
		{ to: "dash", when: (c) => c.dashing },
		{
			to: "idle",
			when: (c) => c.grounded && !c.landing && c.dir === 0,
		},
		{
			to: "run",
			when: (c) => c.grounded && !c.landing && c.dir !== 0,
		},
		{ to: "land", when: (c) => c.landing },
		{
			to: "wallslide",
			when: (c) => !c.grounded && !c.landing && c.onWall,
		},
		{
			to: "walljump",
			when: (c) =>
				!c.grounded &&
				!c.landing &&
				!c.onWall &&
				c.wallJumping &&
				!falling(c),
		},
		{
			to: "jump",
			when: (c) =>
				!c.grounded &&
				!c.landing &&
				!c.onWall &&
				!c.wallJumping &&
				!falling(c),
		},
		{
			to: "fall",
			when: (c) =>
				!c.grounded && !c.landing && !c.onWall && falling(c),
		},
	],
	states: {
		dash: {},
		idle: {},
		run: {},
		land: {},
		wallslide: {},
		walljump: {},
		jump: {},
		fall: {},
	},
});
