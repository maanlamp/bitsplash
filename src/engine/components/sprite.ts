import unknownSrc from "../assets/unknown.png";
import { file } from "../serialization/field-enums";
import { serializable } from "../serialization/serializable";

export type SpriteConfig = Readonly<{
	key: string;
	width: number;
	height: number;
	opacity?: number;
	flipX?: boolean;
}>;

@serializable("Sprite")
export class SpriteComponent {
	@file("image/*")
	url: string;
	width: number;
	height: number;
	opacity: number;
	flipX: boolean;

	constructor(
		config: SpriteConfig = {
			key: unknownSrc,
			width: 16,
			height: 16,
		},
	) {
		this.url = config.key;
		this.width = config.width;
		this.height = config.height;
		this.opacity = config.opacity ?? 1;
		this.flipX = config.flipX ?? false;
	}
}
