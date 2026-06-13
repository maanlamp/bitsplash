import { FontSettings } from "../../engine/font-settings";
import { multiline } from "../../engine/serialization/field-enums";
import { serializable } from "../../engine/serialization/serializable";

@serializable("DialogueSource")
export class DialogueSourceComponent {
	@multiline()
	text: string;
	charactersPerSecond: number;
	font: FontSettings;

	constructor(
		text: string = "",
		charactersPerSecond: number = 24,
		font: FontSettings = new FontSettings(),
	) {
		this.text = text;
		this.charactersPerSecond = charactersPerSecond;
		this.font = font;
	}
}
