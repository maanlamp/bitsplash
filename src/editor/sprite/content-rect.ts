import type { BspriteRect } from "../../engine/sprite/bsprite-manifest";
import type { PixelBuffer } from "./pixel-buffer";

/**
 * The alpha bounding box of a single buffer: the tightest rect covering every
 * pixel with non-zero alpha. Returns `null` when the buffer is fully
 * transparent.
 */
export const alphaBounds = (
	image: PixelBuffer,
): BspriteRect | null => {
	const { width, height, data } = image;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3]! !== 0) {
				if (x < minX) {
					minX = x;
				}
				if (x > maxX) {
					maxX = x;
				}
				if (y < minY) {
					minY = y;
				}
				if (y > maxY) {
					maxY = y;
				}
			}
		}
	}
	if (maxX < 0) {
		return null;
	}
	return {
		x: minX,
		y: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
};

/**
 * Derive a tag's content rect: the union of the alpha bounding boxes of its
 * baked frames. Returns `null` when every frame is fully transparent — the
 * manifest omits the entry and the engine falls back to the full canvas rect.
 *
 * @see docs/bsprite-format.md — "contentRects — derived at bake, per tag"
 */
export const contentRectForFrames = (
	frames: readonly PixelBuffer[],
): BspriteRect | null => {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const frame of frames) {
		const bounds = alphaBounds(frame);
		if (!bounds) {
			continue;
		}
		minX = Math.min(minX, bounds.x);
		minY = Math.min(minY, bounds.y);
		maxX = Math.max(maxX, bounds.x + bounds.width - 1);
		maxY = Math.max(maxY, bounds.y + bounds.height - 1);
	}
	if (maxX < 0 || !Number.isFinite(maxX)) {
		return null;
	}
	return {
		x: minX,
		y: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
};
