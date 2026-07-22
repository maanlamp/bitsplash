/**
 * A canvas-sized RGBA pixel buffer in **straight (non-premultiplied) alpha**,
 * row-major, 4 bytes per pixel (`r,g,b,a`), each `0..255`. This is structurally
 * a subset of the DOM {@link ImageData}, so a real `ImageData` (from
 * `ctx.getImageData`) satisfies it directly — yet the type carries no DOM
 * dependency, which keeps the compositor, content-rect deriver and PNG codec
 * pure and unit-testable in a headless (canvas-free) test runner.
 */
export type PixelBuffer = Readonly<{
	width: number;
	height: number;
	data: Uint8ClampedArray;
}>;

/**
 * Allocate a fully-transparent {@link PixelBuffer} of the given size.
 *
 * @example
 * const blank = blankPixels(16, 16); // 16×16, every channel 0
 */
export const blankPixels = (
	width: number,
	height: number,
): PixelBuffer => ({
	width,
	height,
	data: new Uint8ClampedArray(width * height * 4),
});
