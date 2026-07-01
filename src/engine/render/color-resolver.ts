import Color from "colorjs.io";

export type RGBA = readonly [number, number, number, number];

export type ColorInput = string | RGBA;

const clamp01 = (value: number | null): number =>
	Math.max(0, Math.min(1, value ?? 0));

export const fadeAlpha = (remaining: number, fade: number): number =>
	clamp01(remaining / fade);

export const withAlpha = (
	color: ColorInput,
	alpha: number,
): ColorInput => {
	if (typeof color !== "string") {
		return [color[0], color[1], color[2], color[3] * alpha];
	}
	return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
};

export class ColorResolver {
	private cache = new Map<string, RGBA>();
	private ctx: CanvasRenderingContext2D | null = null;

	resolve(input: ColorInput): RGBA {
		if (typeof input !== "string") {
			return input;
		}
		const cached = this.cache.get(input);
		if (cached) {
			return cached;
		}
		const rgba = this.parse(input);
		this.cache.set(input, rgba);
		return rgba;
	}

	private parse(input: string): RGBA {
		try {
			const color = new Color(input).to("srgb");
			const [r, g, b] = color.coords;
			return [
				clamp01(r),
				clamp01(g),
				clamp01(b),
				clamp01(color.alpha),
			];
		} catch {
			return this.parseViaCanvas(input);
		}
	}

	private parseViaCanvas(input: string): RGBA {
		const ctx = (this.ctx ??= this.createContext());
		if (!ctx) {
			return [0, 0, 0, 1];
		}
		ctx.fillStyle = "#000";
		ctx.fillStyle = input;
		ctx.fillRect(0, 0, 1, 1);
		const data = ctx.getImageData(0, 0, 1, 1).data;
		return [
			(data[0] ?? 0) / 255,
			(data[1] ?? 0) / 255,
			(data[2] ?? 0) / 255,
			(data[3] ?? 255) / 255,
		];
	}

	private createContext(): CanvasRenderingContext2D | null {
		const ctx = document
			.createElement("canvas")
			.getContext("2d", { willReadFrequently: true });
		if (ctx) {
			ctx.globalCompositeOperation = "copy";
		}
		return ctx;
	}
}
