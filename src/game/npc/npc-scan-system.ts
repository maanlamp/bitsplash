import type { Seconds } from "../../engine/duration";
import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import { stepMachine } from "../../engine/fsm/step-machine";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { profiler } from "../../engine/profiling/profiler";
import { currentExclusiveSequence } from "../../engine/sequence/sequence-system";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { NpcScanComponent } from "./npc-scan-component";
import { npcScanMachine } from "./npc-scan-def";

/**
 * Whether an entity is cast in the running exclusive sequence — a conversation or
 * a cutscene.
 *
 * Any role counts, so this covers being talked to and being directed. Reading the
 * cast rather than a named blackboard key keeps the check role-agnostic and free
 * of a string that points at another module's content.
 */
const performing = (ecs: ReadonlyECS, id: EntityId): boolean => {
	const sequence = currentExclusiveSequence(ecs);
	return (
		sequence !== undefined &&
		Object.values(sequence.run.cast).includes(id)
	);
};

/**
 * Turns idle NPCs in place on a dwell timer, so their view cone sweeps instead of
 * being pinned right forever.
 *
 * Must run before `FacingSystem`, which consumes and clears `intent.faceX` each
 * frame. Two cases yield the frame instead of writing:
 *
 * - **while performing** — `DialogueTriggerSystem` turns an NPC toward the player
 *   once, on the frame the interact is read, so an ungated scan would win every
 *   later frame and turn them away mid-conversation;
 * - **while moving** — `FacingSystem` prefers `faceX` over `moveX`, so scanning a
 *   walking NPC would face them backwards.
 */
@profiler("NPC scan", "AI")
export class NpcScanSystem extends UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		for (const [id, scan, intent] of ecs.query(
			NpcScanComponent,
			MovementIntentComponent,
		)) {
			if (intent.moveX !== 0 || performing(ecs, id)) {
				continue;
			}
			stepMachine(
				npcScanMachine,
				scan.machine,
				{ dwell: scan.dwell.seconds },
				(dt / 1000) as Seconds,
			);
			intent.faceX = scan.machine.current === "scanRight" ? 1 : -1;
		}
	}
}
