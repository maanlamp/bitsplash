import type { ResumableSequence } from "../sequence/resumable-sequence";
import { SequenceState } from "../sequence/sequence-state";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type { CutsceneContext, CutsceneDef } from "./cutscene";

@serializable("Cutscene")
export class CutsceneComponent {
	@serialize() defId = "";
	@serialize() sceneIndex = 0;
	@serialize() sequence: SequenceState = new SequenceState();
	@serialize() queue: string[] = [];

	def: CutsceneDef | null = null;
	runner: ResumableSequence<CutsceneContext> | null = null;
	skipHeldTime = 0;

	constructor(def: CutsceneDef | null = null) {
		if (def) {
			this.def = def;
			this.defId = def.id;
		}
	}
}
