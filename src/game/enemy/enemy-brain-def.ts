import { defineMachine } from "../../engine/fsm/machine";

const SUSPICION = 0.5;
const PURSUE_GIVEUP = 3;

export type EnemyCtx = {
	detection: number;
	seen: boolean;
	provoked: boolean;
	engaged: boolean;
	inAttackRange: boolean;
	leftTerritory: boolean;
	unreachableTarget: boolean;
	reachedGoal: boolean;
	timeSinceSeen: number;
	targetDead: boolean;
	lowNerve: boolean;
	forgotten: boolean;
	surpriseDuration: number;
	searchDuration: number;
};

export type EnemyState =
	| "patrol"
	| "surprised"
	| "combat"
	| "chase"
	| "attack"
	| "retreat"
	| "search"
	| "flee";

export const enemyBrainMachine = defineMachine<EnemyCtx>()({
	initial: "patrol",
	root: [
		{
			to: "flee",
			priority: 100,
			when: (c, m) => c.lowNerve && !c.forgotten && !m.in("flee"),
		},
		{
			to: "patrol",
			priority: 90,
			when: (c, m) =>
				c.targetDead && !m.in("patrol") && !m.in("flee"),
		},
	],
	states: {
		patrol: {
			transitions: [
				{ to: "surprised", when: (c) => c.seen },
				{
					to: "search",
					when: (c) => c.detection >= SUSPICION && !c.seen,
				},
			],
		},
		surprised: {
			transitions: [
				{
					to: "chase",
					when: (c, m) => m.elapsed >= c.surpriseDuration,
				},
			],
		},
		combat: {
			children: ["chase", "attack", "retreat", "search"],
			initial: "chase",
		},
		chase: {
			transitions: [
				{ to: "attack", when: (c) => c.inAttackRange },
				{ to: "retreat", when: (c) => c.unreachableTarget },
				{ to: "patrol", when: (c) => !c.seen && c.leftTerritory },
				{
					to: "search",
					when: (c) =>
						!c.seen &&
						(c.reachedGoal || c.timeSinceSeen >= PURSUE_GIVEUP),
				},
			],
		},
		attack: {
			transitions: [{ to: "chase", when: (c) => !c.inAttackRange }],
		},
		search: {
			transitions: [
				{ to: "attack", when: (c) => c.inAttackRange },
				{ to: "chase", when: (c) => c.engaged },
				{
					to: "patrol",
					when: (c, m) => m.elapsed >= c.searchDuration,
				},
			],
		},
		retreat: {
			transitions: [
				{ to: "attack", when: (c) => c.inAttackRange },
				{
					to: "chase",
					when: (c) => c.engaged && !c.unreachableTarget,
				},
				{ to: "patrol", when: (c) => !c.provoked && !c.seen },
				{
					to: "patrol",
					when: (c, m) => m.elapsed >= c.searchDuration,
				},
			],
		},
		flee: {
			transitions: [{ to: "patrol", when: (c) => c.forgotten }],
		},
	},
});
