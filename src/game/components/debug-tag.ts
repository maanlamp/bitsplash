import { FontSettings } from "../../engine/font-settings";
import { serializable } from "../../engine/serialization/serializable";

@serializable("DebugTag")
export class DebugTagComponent {
	label: string;
	font: FontSettings;

	constructor(
		label: string = "entity",
		font: FontSettings = new FontSettings(),
	) {
		this.label = label;
		this.font = font;
	}
}
