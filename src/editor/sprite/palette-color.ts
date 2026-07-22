/**
 * A single working-palette entry: an **opaque** sRGB colour, each channel
 * `0..255`. The palette is deliberately alpha-free — the `.gpl` and `.hex`
 * interchange formats carry only RGB, and the shading ink walks opaque ramps —
 * so alpha is never part of a palette entry's identity.
 */
export type PaletteColor = Readonly<{
	r: number;
	g: number;
	b: number;
}>;

const clampChannel = (value: number): number =>
	value < 0 ? 0 : value > 255 ? 255 : Math.round(value);

/** Build a {@link PaletteColor}, clamping each channel into `0..255`. */
export const paletteColor = (
	r: number,
	g: number,
	b: number,
): PaletteColor => ({
	r: clampChannel(r),
	g: clampChannel(g),
	b: clampChannel(b),
});

/** Whether two palette colours are the same opaque RGB triple. */
export const paletteColorsEqual = (
	a: PaletteColor,
	b: PaletteColor,
): boolean => a.r === b.r && a.g === b.g && a.b === b.b;

const hex2 = (value: number): string =>
	clampChannel(value).toString(16).padStart(2, "0");

/** Lowercase `#rrggbb` for a palette colour. */
export const paletteColorToHex = (color: PaletteColor): string =>
	`#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;

/**
 * Opaque CSS `rgb(r g b)` for a palette colour — the form the shading ink hands
 * to the document paint path so the shift always lands fully opaque.
 */
export const paletteColorToCss = (color: PaletteColor): string =>
	`rgb(${color.r} ${color.g} ${color.b})`;

/**
 * Parse a `RRGGBB` / `#RRGGBB` (and shorthand `RGB` / `#RGB`) hex string into a
 * {@link PaletteColor}, or `null` when it is not a valid 3- or 6-digit hex
 * colour. Case-insensitive; surrounding whitespace is ignored.
 */
export const hexToPaletteColor = (
	input: string,
): PaletteColor | null => {
	const hex = input.trim().replace(/^#/, "");
	if (/^[0-9a-fA-F]{6}$/.test(hex)) {
		return paletteColor(
			parseInt(hex.slice(0, 2), 16),
			parseInt(hex.slice(2, 4), 16),
			parseInt(hex.slice(4, 6), 16),
		);
	}
	if (/^[0-9a-fA-F]{3}$/.test(hex)) {
		return paletteColor(
			parseInt(hex[0]! + hex[0]!, 16),
			parseInt(hex[1]! + hex[1]!, 16),
			parseInt(hex[2]! + hex[2]!, 16),
		);
	}
	return null;
};
