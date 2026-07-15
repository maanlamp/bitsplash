import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("SequenceTag")
export class SequenceTagComponent {
	@serialize() tag: string;

	constructor(tag = "") {
		this.tag = tag;
	}
}
