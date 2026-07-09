import { MachineState } from "../../engine/fsm/machine-state";
import { serializable } from "../../engine/serialization/serializable";

@serializable("NpcAnimation")
export class NpcAnimationComponent {
	anim: MachineState = new MachineState("idle", 0);
}
