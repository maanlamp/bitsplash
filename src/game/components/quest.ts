import { serializable } from "../../engine/serialization/serializable";

@serializable("Quest")
export class QuestComponent {
	questId: string;
	stage: string;
	counters: Record<string, number>;

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
