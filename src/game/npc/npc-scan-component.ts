import { Duration } from "../../engine/duration";
import { MachineState } from "../../engine/fsm/machine-state";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { npcScanMachine } from "./npc-scan-def";

/**
 * How long an idle NPC holds a direction before looking the other way, plus the
 * scan machine's run-state.
 */
@serializable("NpcScan")
export class NpcScanComponent {
	@serialize({ group: "timing" }) dwell: Duration;

	@serialize() machine: MachineState = new MachineState(
		npcScanMachine.initialLeaf,
		0,
	);

	constructor(dwell: number = 2.5) {
		this.dwell = new Duration(dwell);
	}
}
