import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type { SequenceClass, SequenceDef } from "./sequence-def";
import { SequenceRunState } from "./sequence-run-state";

@serializable("Sequence")
export class SequenceComponent {
	@serialize() defId = "";
	@serialize() sequenceClass: SequenceClass = "exclusive";
	@serialize() run: SequenceRunState = new SequenceRunState();
	@serialize() queue: string[] = [];

	currentSkippable = true;
	skipHeldTime = 0;

	constructor(def: SequenceDef | null = null) {
		if (def) {
			this.defId = def.id;
			this.sequenceClass = def.class;
		}
	}
}
