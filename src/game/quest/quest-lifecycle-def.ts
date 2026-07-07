import { defineMachine } from "../../engine/fsm/machine";

export type QuestCtx = { pending: string | null };

export const questLifecycleMachine = defineMachine<QuestCtx>()({
	initial: "offered",
	states: {
		offered: {
			transitions: [
				{ to: "active", when: (c) => c.pending === "active" },
			],
		},
		active: {
			transitions: [
				{ to: "return", when: (c) => c.pending === "return" },
			],
		},
		return: {
			transitions: [
				{ to: "complete", when: (c) => c.pending === "complete" },
			],
		},
		complete: {},
	},
});
