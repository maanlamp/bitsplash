import { multiline } from "../../engine/serialization/field-enums";
import { serializable } from "../../engine/serialization/serializable";

@serializable("DialogueSource")
export class DialogueSourceComponent {
	@multiline()
	text: string;
	charactersPerSecond: number;

	constructor(text: string = "", charactersPerSecond: number = 24) {
		this.text = text;
		this.charactersPerSecond = charactersPerSecond;
	}
}
