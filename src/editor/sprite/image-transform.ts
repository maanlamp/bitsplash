import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * Mirror a {@link PixelBuffer} left-to-right, producing a fresh buffer of the
 * same dimensions; the input is never mutated. Column `x` maps to `width-1-x`.
 * Applying it twice is the identity — which is exactly why the flip-horizontal
 * command uses itself as its own inverse.
 *
 * @example
 * const mirrored = flipHorizontal(buffer); // left edge is now the right edge
 */
export const flipHorizontal = (buffer: PixelBuffer): PixelBuffer => {
	const { width, height, data } = buffer;
	const out = blankPixels(width, height);
	const od = out.data;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const src = (y * width + x) * 4;
			const dst = (y * width + (width - 1 - x)) * 4;
			od[dst] = data[src]!;
			od[dst + 1] = data[src + 1]!;
			od[dst + 2] = data[src + 2]!;
			od[dst + 3] = data[src + 3]!;
		}
	}
	return out;
};

/**
 * Mirror a {@link PixelBuffer} top-to-bottom, producing a fresh buffer of the
 * same dimensions; the input is never mutated. Row `y` maps to `height-1-y`.
 * Applying it twice is the identity, so the flip-vertical command is its own
 * inverse.
 */
export const flipVertical = (buffer: PixelBuffer): PixelBuffer => {
	const { width, height, data } = buffer;
	const out = blankPixels(width, height);
	const od = out.data;
	for (let y = 0; y < height; y++) {
		const srcRow = y * width * 4;
		const dstRow = (height - 1 - y) * width * 4;
		od.set(data.subarray(srcRow, srcRow + width * 4), dstRow);
	}
	return out;
};

/**
 * Rotate a {@link PixelBuffer} 90° **clockwise**, producing a fresh buffer whose
 * dimensions are swapped (`width`↔`height`); the input is never mutated. Four
 * applications are the identity, and {@link rotateCcw} is the exact inverse.
 */
export const rotateCw = (buffer: PixelBuffer): PixelBuffer => {
	const { width, height, data } = buffer;
	const out = blankPixels(height, width);
	const nw = height;
	const nh = width;
	const od = out.data;
	for (let ny = 0; ny < nh; ny++) {
		for (let nx = 0; nx < nw; nx++) {
			const ox = ny;
			const oy = height - 1 - nx;
			const src = (oy * width + ox) * 4;
			const dst = (ny * nw + nx) * 4;
			od[dst] = data[src]!;
			od[dst + 1] = data[src + 1]!;
			od[dst + 2] = data[src + 2]!;
			od[dst + 3] = data[src + 3]!;
		}
	}
	return out;
};

/**
 * Rotate a {@link PixelBuffer} 90° **counter-clockwise**, producing a fresh
 * buffer whose dimensions are swapped; the input is never mutated. The exact
 * inverse of {@link rotateCw}.
 */
export const rotateCcw = (buffer: PixelBuffer): PixelBuffer => {
	const { width, height, data } = buffer;
	const out = blankPixels(height, width);
	const nw = height;
	const nh = width;
	const od = out.data;
	for (let ny = 0; ny < nh; ny++) {
		for (let nx = 0; nx < nw; nx++) {
			const ox = width - 1 - ny;
			const oy = nx;
			const src = (oy * width + ox) * 4;
			const dst = (ny * nw + nx) * 4;
			od[dst] = data[src]!;
			od[dst + 1] = data[src + 1]!;
			od[dst + 2] = data[src + 2]!;
			od[dst + 3] = data[src + 3]!;
		}
	}
	return out;
};
