import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import type { QuestComponent } from "./quest-component";

@serializable("QuestMarker")
export class QuestMarkerTagComponent {
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
