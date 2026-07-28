import { defineMachine } from "../../engine/fsm/machine";

/**
 * Transient guard context for {@link npcScanMachine}, rebuilt each frame from
 * `NpcScanComponent.dwell`. Never serialized.
 */
export type NpcScanCtx = {
	/** Seconds an NPC holds one direction before turning. */
	dwell: number;
};

/**
 * An idle NPC looking about: hold one direction for `dwell` seconds, then the
 * other. Nothing but facing changes — the system writes `intent.faceX` and never
 * `intent.moveX`, so `NpcAnimationSystem`, which derives its animation from
 * `Math.sign(intent.moveX)`, stays on the idle animation throughout.
 */
export const npcScanMachine = defineMachine<NpcScanCtx>()({
	initial: "scanRight",
	states: {
		scanRight: {
			transitions: [
				{ to: "scanLeft", when: (c, m) => m.elapsed >= c.dwell },
			],
		},
		scanLeft: {
			transitions: [
				{ to: "scanRight", when: (c, m) => m.elapsed >= c.dwell },
			],
		},
	},
});
