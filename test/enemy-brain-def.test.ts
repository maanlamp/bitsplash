import { expect, test } from "bun:test";

import type { Seconds } from "../src/engine/duration";
import {
	type EnemyCtx,
	type EnemyState,
	enemyBrainMachine,
} from "../src/game/enemy/enemy-brain-def";

const transition = (
	current: EnemyState,
	elapsed: number,
	ctx: EnemyCtx,
): EnemyState =>
	enemyBrainMachine.step(
		{ current, elapsed: elapsed as Seconds },
		ctx,
		0 as Seconds,
	).next.current;

const calm = (): EnemyCtx => ({
	detection: 0,
	seen: false,
	provoked: false,
	engaged: false,
	inAttackRange: false,
	leftTerritory: false,
	unreachableTarget: false,
	reachedGoal: false,
	timeSinceSeen: Infinity,
	targetDead: false,
	lowNerve: false,
	forgotten: false,
	surpriseDuration: 0.4,
	searchDuration: 3,
});

const cases: Array<
	[string, EnemyState, number, Partial<EnemyCtx>, EnemyState]
> = [
	[
		"brief LOS loss keeps chasing",
		"chase",
		2,
		{ seen: false, timeSinceSeen: 0.1 },
		"chase",
	],
	[
		"reacquire keeps chasing (no re-surprise)",
		"chase",
		2,
		{ seen: true, timeSinceSeen: 0 },
		"chase",
	],
	[
		"first sight surprises",
		"patrol",
		5,
		{ seen: true, timeSinceSeen: 0 },
		"surprised",
	],
	[
		"surprise ignores a flicker",
		"surprised",
		0.2,
		{ seen: false, timeSinceSeen: 0.6 },
		"surprised",
	],
	[
		"surprise beat ends -> chase",
		"surprised",
		0.5,
		{ seen: true },
		"chase",
	],
	[
		"lost at last-known spot -> search",
		"chase",
		3,
		{ seen: false, timeSinceSeen: 4, reachedGoal: true },
		"search",
	],
	[
		"search times out -> patrol",
		"search",
		3.1,
		{ seen: false },
		"patrol",
	],
	[
		"visible target past territory stays chase",
		"chase",
		5,
		{ seen: true, timeSinceSeen: 0, leftTerritory: true },
		"chase",
	],
	[
		"lost target past territory -> patrol",
		"chase",
		5,
		{ seen: false, timeSinceSeen: 1.5, leftTerritory: true },
		"patrol",
	],
	[
		"provoked past territory does not give up",
		"chase",
		2,
		{ provoked: true, seen: false, timeSinceSeen: 1 },
		"chase",
	],
	[
		"freshly hit while searching -> chase",
		"search",
		1,
		{ engaged: true, provoked: true, seen: false },
		"chase",
	],
	[
		"unreachable target -> retreat",
		"chase",
		2,
		{ seen: true, engaged: true, unreachableTarget: true },
		"retreat",
	],
	[
		"retreat, safe -> patrol",
		"retreat",
		1,
		{ provoked: false, seen: false },
		"patrol",
	],
	[
		"retreat, attacker reachable again -> chase",
		"retreat",
		1,
		{ engaged: true, provoked: true, unreachableTarget: false },
		"chase",
	],
	[
		"target dead -> patrol",
		"chase",
		2,
		{ targetDead: true },
		"patrol",
	],
	[
		"low nerve -> flee",
		"chase",
		2,
		{ lowNerve: true, forgotten: false },
		"flee",
	],
	[
		"non-visual suspicion -> search",
		"patrol",
		5,
		{ seen: false, detection: 0.5 },
		"search",
	],
];

for (const [name, from, elapsed, overrides, want] of cases) {
	test(name, () => {
		expect(
			transition(from, elapsed, { ...calm(), ...overrides }),
		).toBe(want);
	});
}

// Invariant: no engaged state is a dead-end. Once the target is gone, every
// state must reach patrol on its own.
test("every state reaches patrol once the target is gone", () => {
	const starts: EnemyState[] = [
		"surprised",
		"chase",
		"attack",
		"search",
		"retreat",
		"flee",
	];
	for (const start of starts) {
		let cur: EnemyState = start;
		const gone: EnemyCtx = {
			...calm(),
			forgotten: true,
			reachedGoal: true,
		};
		let landed = false;
		for (let i = 0; i < 50; i++) {
			cur = transition(cur, 100, gone);
			if (cur === "patrol") {
				landed = true;
				break;
			}
		}
		expect(landed).toBe(true);
	}
});
