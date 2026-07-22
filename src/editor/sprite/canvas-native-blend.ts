import type { NativeBlendCompositor } from "./bake-compositor";
import type { PixelBuffer } from "./pixel-buffer";

const context = (
	width: number,
	height: number,
): CanvasRenderingContext2D => {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("2D context unavailable.");
	}
	ctx.imageSmoothingEnabled = false;
	return ctx;
};

/**
 * Native-blend compositor backed by canvas2d `globalCompositeOperation` — the
 * browser/editor wiring for {@link import("./bake-compositor").compositeFrame}.
 * Draws the backdrop, then the source layer at `opacity` under the requested
 * blend, and reads the result back as straight-alpha pixels. DOM-dependent, so
 * it is never exercised by the headless test suite (which uses only the pure
 * `source-over`/legacy paths).
 */
export const canvasNativeBlend: NativeBlendCompositor = (
	backdrop,
	source,
	opacity,
	blend,
): PixelBuffer => {
	const { width, height } = backdrop;
	const ctx = context(width, height);
	const backdropImage = ctx.createImageData(width, height);
	backdropImage.data.set(backdrop.data);
	ctx.putImageData(backdropImage, 0, 0);

	const src = context(width, height);
	const sourceImage = src.createImageData(width, height);
	sourceImage.data.set(source.data);
	src.putImageData(sourceImage, 0, 0);

	ctx.globalAlpha = opacity;
	ctx.globalCompositeOperation = blend;
	ctx.drawImage(src.canvas, 0, 0);

	return ctx.getImageData(0, 0, width, height);
};
