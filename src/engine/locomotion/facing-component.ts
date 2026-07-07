import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("Facing")
export class FacingComponent {
	@serialize() dir: number;

	constructor(dir: number = 1) {
		this.dir = dir;
	}
}
