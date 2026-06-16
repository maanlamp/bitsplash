import { serializable } from "../../engine/serialization/serializable";

@serializable("DialogueSource")
export class DialogueSourceComponent {
	knot: string;

	constructor(knot = "") {
		this.knot = knot;
	}
}
