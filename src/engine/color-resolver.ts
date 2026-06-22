import Color from "colorjs.io";

export type RGBA = readonly [number, number, number, number];

export type ColorInput = string | RGBA;

const clamp01 = (value: number | null): number =>
	Math.max(0, Math.min(1, value ?? 0));

export class ColorResolver {
	private cache = new Map<string, RGBA>();

	resolve(input: ColorInput): RGBA {
		if (typeof input !== "string") {
			return input;
		}
		const cached = this.cache.get(input);
		if (cached) {
			return cached;
		}
		let rgba: RGBA;
		try {
			const color = new Color(input).to("srgb");
			const [r, g, b] = color.coords;
			rgba = [
				clamp01(r),
				clamp01(g),
				clamp01(b),
				clamp01(color.alpha),
			];
		} catch {
			rgba = [0, 0, 0, 1];
		}
		this.cache.set(input, rgba);
		return rgba;
	}
}
