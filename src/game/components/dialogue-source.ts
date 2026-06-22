import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("DialogueSource")
export class DialogueSourceComponent {
	@serialize() knot: string;

	constructor(knot = "") {
		this.knot = knot;
	}
}
