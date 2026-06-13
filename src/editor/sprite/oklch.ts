import Color from "colorjs.io";

export type Oklch = Readonly<{ l: number; c: number; h: number }>;

export type OklchColor = Readonly<{
	l: number;
	c: number;
	h: number;
	alpha: number;
}>;

const OKLCH = Color.spaces.oklch!;
const SRGB = Color.spaces.srgb!;

const num = (value: number | null): number => value ?? 0;

const clamp01 = (value: number): number =>
	Math.max(0, Math.min(1, value));

const oklchInGamut = (l: number, c: number, h: number): boolean =>
	SRGB.inGamut(OKLCH.to(SRGB, [l, c, h]));

export const oklchToRgb255 = (
	l: number,
	c: number,
	h: number,
): [number, number, number] => {
	const [r, g, b] = OKLCH.to(SRGB, [l, c, h]);
	return [
		Math.round(clamp01(num(r)) * 255),
		Math.round(clamp01(num(g)) * 255),
		Math.round(clamp01(num(b)) * 255),
	];
};

export const chromaInGamut = (
	l: number,
	c: number,
	h: number,
): number => {
	if (oklchInGamut(l, c, h)) {
		return c;
	}
	let lo = 0;
	let hi = c;
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (oklchInGamut(l, mid, h)) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
};

export const rgbToOklch = (
	red: number,
	green: number,
	blue: number,
): Oklch => {
	const [l, c, h] = SRGB.to(OKLCH, [
		red / 255,
		green / 255,
		blue / 255,
	]);
	return { l: num(l), c: num(c), h: num(h) };
};

export const formatOklch = (color: OklchColor): string =>
	`oklch(${color.l.toFixed(4)} ${color.c.toFixed(4)} ${color.h
		.toFixed(2)
		.padStart(6, "\u2007")} / ${color.alpha.toFixed(3)})`;

const number = (token: string): number =>
	token.endsWith("%") ? parseFloat(token) / 100 : parseFloat(token);

export const parseOklch = (input: string): OklchColor | null => {
	const match = input
		.trim()
		.match(
			/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/i,
		);
	if (!match) {
		return null;
	}
	const l = Math.max(0, Math.min(1, number(match[1]!)));
	const c = Math.max(0, number(match[2]!));
	const h = ((number(match[3]!) % 360) + 360) % 360;
	const alpha = match[4]
		? Math.max(0, Math.min(1, number(match[4])))
		: 1;
	return { l, c, h, alpha };
};
