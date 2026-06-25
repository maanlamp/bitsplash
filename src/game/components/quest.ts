import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Quest")
export class QuestComponent {
	@serialize() questId: string;
	@serialize() stage: string;
	@serialize() counters: Record<string, number>;
	@serialize() goals: Record<string, number>;

	constructor(
		questId = "",
		stage = "",
		counters: Record<string, number> = {},
		goals: Record<string, number> = {},
	) {
		this.questId = questId;
		this.stage = stage;
		this.counters = counters;
		this.goals = goals;
	}
}
