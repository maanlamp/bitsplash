import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Faction")
export class FactionComponent {
	@serialize() faction: string;

	constructor(faction: string = "neutral") {
		this.faction = faction;
	}
}
