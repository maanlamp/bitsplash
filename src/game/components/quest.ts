import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Quest")
export class QuestComponent {
	@serialize() questId: string;
	@serialize() stage: string;
	@serialize() counters: Record<string, number>;

	constructor(
		questId = "",
		stage = "",
		counters: Record<string, number> = {},
	) {
		this.questId = questId;
		this.stage = stage;
		this.counters = counters;
	}
}
