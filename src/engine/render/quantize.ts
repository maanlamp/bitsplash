/**
 * Snap a world-space coordinate to the nearest whole screen texel at the given
 * zoom, so pixel-art edges land on texel boundaries instead of sampling
 * between them.
 *
 * At `zoom` 1 this rounds to whole world units; at `zoom` 4 one screen texel is
 * a quarter of a world unit, so the result lands on quarter-unit steps.
 *
 * @example
 * quantizeToTexel(10.37, 4); // 10.25
 * quantizeToTexel(10.37, 1); // 10
 */
export const quantizeToTexel = (
	value: number,
	zoom: number,
): number => Math.round(value * zoom) / zoom;
