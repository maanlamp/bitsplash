import { defineMachine } from "../../engine/fsm/machine";

const FALL_VELOCITY = 150;

export type MoveCtx = {
	grounded: boolean;
	dir: number;
	vy: number;
	onWall: boolean;
	dashActive: boolean;
	jumpWall: boolean;
	jumpNormal: boolean;
};

export type MoveState =
	| "dash"
	| "grounded"
	| "idle"
	| "run"
	| "airborne"
	| "jump"
	| "fall"
	| "walljump"
	| "wallslide";

const falling = (c: MoveCtx): boolean => c.vy >= FALL_VELOCITY;

export const playerMoveMachine = defineMachine<MoveCtx>()({
	initial: "grounded",
	root: [{ to: "dash", priority: 100, when: (c) => c.dashActive }],
	states: {
		dash: {
			transitions: [
				{
					to: "idle",
					when: (c) => !c.dashActive && c.grounded && c.dir === 0,
				},
				{
					to: "run",
					when: (c) => !c.dashActive && c.grounded && c.dir !== 0,
				},
				{
					to: "wallslide",
					when: (c) => !c.dashActive && !c.grounded && c.onWall,
				},
				{
					to: "jump",
					when: (c) =>
						!c.dashActive && !c.grounded && !c.onWall && !falling(c),
				},
				{
					to: "fall",
					when: (c) =>
						!c.dashActive && !c.grounded && !c.onWall && falling(c),
				},
			],
		},
		grounded: {
			children: ["idle", "run"],
			initial: "idle",
			transitions: [
				{ to: "walljump", priority: 50, when: (c) => c.jumpWall },
				{ to: "jump", priority: 50, when: (c) => c.jumpNormal },
				{ to: "wallslide", when: (c) => !c.grounded && c.onWall },
				{
					to: "jump",
					when: (c) => !c.grounded && !c.onWall && !falling(c),
				},
				{
					to: "fall",
					when: (c) => !c.grounded && !c.onWall && falling(c),
				},
			],
		},
		idle: {
			transitions: [
				{ to: "run", when: (c) => c.grounded && c.dir !== 0 },
			],
		},
		run: {
			transitions: [
				{ to: "idle", when: (c) => c.grounded && c.dir === 0 },
			],
		},
		airborne: {
			children: ["jump", "fall", "walljump", "wallslide"],
			initial: "fall",
			transitions: [
				{ to: "walljump", priority: 50, when: (c) => c.jumpWall },
				{ to: "jump", priority: 50, when: (c) => c.jumpNormal },
				{ to: "idle", when: (c) => c.grounded && c.dir === 0 },
				{ to: "run", when: (c) => c.grounded && c.dir !== 0 },
			],
		},
		jump: {
			transitions: [
				{ to: "wallslide", when: (c) => c.onWall },
				{ to: "fall", when: (c) => falling(c) },
			],
		},
		fall: {
			transitions: [{ to: "wallslide", when: (c) => c.onWall }],
		},
		walljump: {
			transitions: [
				{ to: "wallslide", when: (c) => c.onWall },
				{ to: "fall", when: (c) => falling(c) },
			],
		},
		wallslide: {
			transitions: [
				{ to: "fall", when: (c) => !c.onWall && falling(c) },
				{ to: "jump", when: (c) => !c.onWall && !falling(c) },
			],
		},
	},
});
