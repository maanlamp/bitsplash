import { FontSettings } from "../text/font-settings";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("DebugTag")
export class DebugTagComponent {
	@serialize() label: string;
	@serialize() font: FontSettings;

	constructor(
		label: string = "entity",
		font: FontSettings = new FontSettings(),
	) {
		this.label = label;
		this.font = font;
	}
}
