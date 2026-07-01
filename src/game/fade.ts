import type { ColorInput } from "../engine/render/color-resolver";

export const fadeAlpha = (remaining: number, fade: number): number =>
	Math.max(0, Math.min(1, remaining / fade));

export const withAlpha = (
	color: ColorInput,
	alpha: number,
): ColorInput => {
	if (typeof color !== "string") {
		return [color[0], color[1], color[2], color[3] * alpha];
	}
	return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
};
