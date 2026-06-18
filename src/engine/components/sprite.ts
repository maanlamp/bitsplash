import unknownSrc from "../assets/unknown.png";
import { file, skip } from "../serialization/field-enums";
import { serializable } from "../serialization/serializable";

export type SpriteClip = Readonly<{
	url: string;
	frameWidth: number;
	frameHeight: number;
	frameCount: number;
	fps: number;
	loop: boolean;
	contentX?: number;
	contentY?: number;
	contentWidth?: number;
	contentHeight?: number;
}>;

export type SpriteSource = Readonly<{
	url: string;
	x: number;
	y: number;
	width: number;
	height: number;
}>;

@serializable("Sprite")
export class SpriteComponent {
	@file("image/*")
	url: string;
	opacity: number;
	flipX: boolean;
	contentX: number | undefined = undefined;
	contentY: number | undefined = undefined;
	contentWidth: number | undefined = undefined;
	contentHeight: number | undefined = undefined;
	clips: Record<string, SpriteClip> = {};
	@skip() current: string = "";
	@skip() playing: string = "";
	@skip() elapsed: number = 0;
	@skip() frame: number = 0;

	constructor(
		url: string = unknownSrc,
		opacity: number = 1,
		flipX: boolean = false,
	) {
		this.url = url;
		this.opacity = opacity;
		this.flipX = flipX;
	}
}

export const spriteSource = (
	sprite: SpriteComponent,
	image: Readonly<{ width: number; height: number }>,
): SpriteSource => {
	const clip = sprite.clips[sprite.current];
	if (clip) {
		return {
			url: clip.url,
			x: sprite.frame * clip.frameWidth + (clip.contentX ?? 0),
			y: clip.contentY ?? 0,
			width: clip.contentWidth ?? clip.frameWidth,
			height: clip.contentHeight ?? clip.frameHeight,
		};
	}
	if (
		sprite.contentWidth !== undefined &&
		sprite.contentHeight !== undefined
	) {
		return {
			url: sprite.url,
			x: sprite.contentX ?? 0,
			y: sprite.contentY ?? 0,
			width: sprite.contentWidth,
			height: sprite.contentHeight,
		};
	}
	return {
		url: sprite.url,
		x: 0,
		y: 0,
		width: image.width,
		height: image.height,
	};
};

export const spriteImageUrl = (sprite: SpriteComponent): string => {
	const clip = sprite.clips[sprite.current];
	return clip ? clip.url : sprite.url;
};
