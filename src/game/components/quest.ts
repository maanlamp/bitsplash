import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Quest")
export class QuestComponent {
	@serialize() id: string;
	@serialize() stage: string;
	@serialize() counters: Record<string, number>;
	@serialize() goals: Record<string, number>;

	constructor(
		id = "",
		stage = "",
		counters: Record<string, number> = {},
		goals: Record<string, number> = {},
	) {
		this.id = id;
		this.stage = stage;
		this.counters = counters;
		this.goals = goals;
	}
}

@serializable("QuestMarker")
export default class QuestMarkerTag {
	@serialize() questId: QuestComponent["id"];
	@serialize() stage: string;
	@serialize() type: string;

	constructor(
		questId: string = "",
		stage: string = "",
		type: string = "",
	) {
		this.questId = questId;
		this.stage = stage;
		this.type = type;
	}
}
