import { captureSupported, pickWithLoupe } from "./loupe-eyedropper";
import { type OklchColor, rgbToOklch } from "./oklch";

type EyeDropperResult = { sRGBHex: string };

type EyeDropperInstance = {
	open: (options?: {
		signal?: AbortSignal;
	}) => Promise<EyeDropperResult>;
};

type EyeDropperCtor = new () => EyeDropperInstance;

const ctor = (): EyeDropperCtor | undefined =>
	(globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;

export const eyeDropperSupported = (): boolean =>
	captureSupported() || typeof ctor() === "function";

const hexToRgb = (
	hex: string,
): { r: number; g: number; b: number } | null => {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) {
		return null;
	}
	const value = parseInt(match[1]!, 16);
	return {
		r: (value >> 16) & 0xff,
		g: (value >> 8) & 0xff,
		b: value & 0xff,
	};
};

// Samples a colour from the app window. Prefers the custom in-app loupe
// (which we can style, and which renders in `doc` — the owning window's
// document); falls back to the native browser eyedropper when the desktop
// capture bridge is unavailable. Resolves null if cancelled.
export const pickScreenColor = async (
	doc: Document,
): Promise<OklchColor | null> => {
	if (captureSupported()) {
		return pickWithLoupe(doc);
	}
	const EyeDropper = ctor();
	if (!EyeDropper) {
		return null;
	}
	try {
		const { sRGBHex } = await new EyeDropper().open();
		const rgb = hexToRgb(sRGBHex);
		if (!rgb) {
			return null;
		}
		const { l, c, h } = rgbToOklch(rgb.r, rgb.g, rgb.b);
		return { l, c, h, alpha: 1 };
	} catch {
		return null;
	}
};
