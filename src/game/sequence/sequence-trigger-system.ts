import {
	hasSequenceDef,
	sequenceDefById,
	startSequence,
} from "../../engine/sequence/sequence-system";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TriggerEnteredEvent } from "../../engine/trigger/events";
import { profiler } from "../../engine/profiling/profiler";

@profiler("Sequence triggers", "Sequence")
export class SequenceTriggerSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		for (const event of events.read(TriggerEnteredEvent)) {
			if (!hasSequenceDef(event.targetId)) {
				continue;
			}
			startSequence(ecs, sequenceDefById(event.targetId));
		}
	}
}
