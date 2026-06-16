import { FontSettings } from "../font-settings";
import { serializable } from "../serialization/serializable";

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
