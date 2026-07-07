import type { Seconds } from "../../engine/duration";
import { defineMachine } from "../../engine/fsm/machine";

export type MeleeCtx = {
	triggered: boolean;
	windup: Seconds;
	recover: Seconds;
};

export const meleeMachine = defineMachine<MeleeCtx>()({
	initial: "idle",
	states: {
		idle: {
			transitions: [{ to: "windup", when: (ctx) => ctx.triggered }],
		},
		windup: {
			transitions: [
				{ to: "recover", when: (ctx, m) => m.elapsed >= ctx.windup },
			],
		},
		recover: {
			transitions: [
				{ to: "idle", when: (ctx, m) => m.elapsed >= ctx.recover },
			],
		},
	},
});
