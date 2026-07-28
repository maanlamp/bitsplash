import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { FACTION_IDS, type FactionId } from "./faction-ids";

@serializable("Faction")
export class FactionComponent {
	@serialize({ options: FACTION_IDS })
	faction: FactionId;

	constructor(faction: FactionId = "neutral") {
		this.faction = faction;
	}
}
