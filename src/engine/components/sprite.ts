import unknownSrc from "../assets/unknown.png";
import { file } from "../serialization/field-enums";
import { serializable } from "../serialization/serializable";

@serializable("Sprite")
export class SpriteComponent {
	@file("image/*")
	url: string;
	width: number;
	height: number;
	opacity: number;
	flipX: boolean;

	constructor(
		url: string = unknownSrc,
		width: number = 16,
		height: number = 16,
		opacity: number = 1,
		flipX: boolean = false,
	) {
		this.url = url;
		this.width = width;
		this.height = height;
		this.opacity = opacity;
		this.flipX = flipX;
	}
}
