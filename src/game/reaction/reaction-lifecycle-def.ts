import { defineMachine } from "../../engine/fsm/machine";

/**
 * Transient guard context for {@link reactionLifecycleMachine}, rebuilt every
 * frame by `ReactionSystem` from the arbitration result and the in-flight
 * {@link ReactionDef}'s durations. Never serialized.
 */
export type ReactionCtx = {
	/** An eligible reaction won arbitration this frame. */
	requested: boolean;
	enter: number;
	hold: number;
	exit: number;
};

/**
 * The display lifecycle of a reaction, and nothing else.
 *
 * Only the phases are code; *which* reaction is playing and *what* it feels are
 * fields on `ReactionComponent` fed from the authored tables, so adding a
 * reaction or an emotion never touches this machine.
 *
 * `reacting` is a super-state, so entering it reports
 * `["reacting", "entering"]` — key the "a reaction began" side effect on
 * `"reacting"`, which fires exactly once per reaction, rather than on a leaf.
 */
export const reactionLifecycleMachine = defineMachine<ReactionCtx>()({
	initial: "idle",
	states: {
		idle: {
			transitions: [{ to: "reacting", when: (c) => c.requested }],
		},
		reacting: {
			children: ["entering", "holding", "exiting"],
			initial: "entering",
		},
		entering: {
			transitions: [
				{ to: "holding", when: (c, m) => m.elapsed >= c.enter },
			],
		},
		holding: {
			transitions: [
				{ to: "exiting", when: (c, m) => m.elapsed >= c.hold },
			],
		},
		exiting: {
			transitions: [
				{ to: "idle", when: (c, m) => m.elapsed >= c.exit },
			],
		},
	},
});
