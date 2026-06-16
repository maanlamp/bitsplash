import { FontSettings } from "../../engine/font-settings";
import { serializable } from "../../engine/serialization/serializable";
import { TILE_SIZE } from "../../engine/tile";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";

@serializable("Interactable")
export class InteractableComponent {
	radius: number;
	prompt: string;
	font: FontSettings;

	constructor(
		radius: number = 1.5 * TILE_SIZE,
		prompt: string = "interact",
		font: FontSettings = new FontSettings(fsPixelSansUrl),
	) {
		this.radius = radius;
		this.prompt = prompt;
		this.font = font;
	}
}
