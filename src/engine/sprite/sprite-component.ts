import { AssetRef } from "../asset-ref";
import unknownSrc from "../assets/unknown.png";
import { Percent } from "../percent";
import type { BspriteRect } from "./bsprite-manifest";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

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
	@serialize() urlRef: AssetRef = new AssetRef("image/*");
	@serialize() opacity: Percent;
	@serialize() flipX: boolean;
	@serialize() contentX: number | undefined = undefined;
	@serialize() contentY: number | undefined = undefined;
	@serialize() contentWidth: number | undefined = undefined;
	@serialize() contentHeight: number | undefined = undefined;
	@serialize() clips: Record<string, SpriteClip> = {};
	@serialize() renderLayer = "entities";
	@serialize() order = 0;
	current: string = "";
	playing: string = "";
	elapsed: number = 0;
	frame: number = 0;
	finished: boolean = false;

	constructor(
		// TODO: Dont have engine sprite assets, raise an error state instead
		url: string = unknownSrc,
		opacity: number = 1,
		flipX: boolean = false,
	) {
		this.urlRef = new AssetRef("image/*", url);
		this.opacity = new Percent(opacity);
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
			url: sprite.urlRef.path,
			x: sprite.contentX ?? 0,
			y: sprite.contentY ?? 0,
			width: sprite.contentWidth,
			height: sprite.contentHeight,
		};
	}
	return {
		url: sprite.urlRef.path,
		x: 0,
		y: 0,
		width: image.width,
		height: image.height,
	};
};

/**
 * Source rect for a `.bsprite` sprite, resolved through the facade instead of a
 * {@link SpriteClip}. The composed sheet lays frame `i` at `x = i * width`
 * (see the facade's `composeSheet`), and the per-tag derived content rect
 * (`asset.contentRect(current)`) supplies the offset and extent. `sprite.frame`
 * is the **absolute manifest frame index** here (not tag-relative), matching the
 * sheet layout the playback system advances it against.
 */
export const bspriteSource = (
	sprite: SpriteComponent,
	asset: Readonly<{
		width: number;
		contentRect: (tag?: string) => BspriteRect;
	}>,
): SpriteSource => {
	const rect = asset.contentRect(sprite.current);
	return {
		url: sprite.urlRef.path,
		x: sprite.frame * asset.width + rect.x,
		y: rect.y,
		width: rect.width,
		height: rect.height,
	};
};

export const spriteImageUrl = (sprite: SpriteComponent): string => {
	const clip = sprite.clips[sprite.current];
	return clip ? clip.url : sprite.urlRef.path;
};
