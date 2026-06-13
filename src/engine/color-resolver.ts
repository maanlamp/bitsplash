export type RGBA = readonly [number, number, number, number];

export type ColorInput = string | RGBA;

export class ColorResolver {
	private ctx: CanvasRenderingContext2D;
	private cache = new Map<string, RGBA>();

	constructor() {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) {
			throw new Error("Failed to get color-resolver context.");
		}
		this.ctx = ctx;
	}

	resolve(input: ColorInput): RGBA {
		if (typeof input !== "string") {
			return input;
		}
		const cached = this.cache.get(input);
		if (cached) {
			return cached;
		}
		const ctx = this.ctx;
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = input;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
		const rgba: RGBA = [r! / 255, g! / 255, b! / 255, a! / 255];
		this.cache.set(input, rgba);
		return rgba;
	}
}
