import type { ColorInput } from "../render/color-resolver";
import type Renderer2D from "../render/renderer-2d";
import type { TileSource } from "../render/renderer-2d";

export type NineSliceInsets = Readonly<{
	left: number;
	right: number;
	top: number;
	bottom: number;
	gap?: number;
}>;

export type DrawNineSliceOpts = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
	insets: NineSliceInsets;
	alpha?: number;
	tint?: ColorInput;
}>;

const sourceWidth = (source: TileSource): number =>
	"naturalWidth" in source ? source.naturalWidth : source.width;

const sourceHeight = (source: TileSource): number =>
	"naturalHeight" in source ? source.naturalHeight : source.height;

type Band = Readonly<{
	src: number;
	srcSize: number;
	dst: number;
	dstSize: number;
}>;

const bands = (
	imageSize: number,
	dstStart: number,
	dstSize: number,
	near: number,
	far: number,
	gap: number,
): Band[] => {
	const scale = Math.min(1, dstSize / (near + far));
	const dstNear = near * scale;
	const dstFar = far * scale;
	const edge = 0.5;
	return [
		{ src: 0, srcSize: near, dst: dstStart, dstSize: dstNear },
		{
			src: near + gap + edge,
			srcSize: imageSize - near - far - gap * 2 - edge * 2,
			dst: dstStart + dstNear,
			dstSize: dstSize - dstNear - dstFar,
		},
		{
			src: imageSize - far,
			srcSize: far,
			dst: dstStart + dstSize - dstFar,
			dstSize: dstFar,
		},
	];
};

export const drawNineSlice = (
	renderer: Renderer2D,
	layer: number,
	image: TileSource,
	opts: DrawNineSliceOpts,
): void => {
	const iw = sourceWidth(image);
	const ih = sourceHeight(image);
	if (iw === 0 || ih === 0) {
		return;
	}
	const { x, y, width, height, insets, alpha, tint } = opts;
	const gap = insets.gap ?? 0;
	const cols = bands(iw, x, width, insets.left, insets.right, gap);
	const rows = bands(ih, y, height, insets.top, insets.bottom, gap);

	for (const r of rows) {
		if (r.srcSize <= 0 || r.dstSize <= 0) {
			continue;
		}
		for (const c of cols) {
			if (c.srcSize <= 0 || c.dstSize <= 0) {
				continue;
			}
			renderer.drawImage(layer, image, {
				x: c.dst + c.dstSize / 2,
				y: r.dst + r.dstSize / 2,
				width: c.dstSize,
				height: r.dstSize,
				srcX: c.src,
				srcY: r.src,
				srcW: c.srcSize,
				srcH: r.srcSize,
				alpha,
				tint,
			});
		}
	}
};
