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
	@serialize() pending: string | null;

	constructor(
		id = "",
		stage = "",
		counters: Record<string, number> = {},
		goals: Record<string, number> = {},
		pending: string | null = null,
	) {
		this.id = id;
		this.stage = stage;
		this.counters = counters;
		this.goals = goals;
		this.pending = pending;
	}
}
