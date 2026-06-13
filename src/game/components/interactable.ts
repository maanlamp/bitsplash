import { serializable } from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tile";

@serializable("Interactable")
export class InteractableComponent {
	radius: number;
	prompt: string;

	constructor(
		radius: number = 1.5 * TILE_SIZE,
		prompt: string = "interact",
	) {
		this.radius = radius;
		this.prompt = prompt;
	}
}
