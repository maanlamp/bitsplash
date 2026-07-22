import {
	type PaletteColor,
	hexToPaletteColor,
	paletteColorToHex,
} from "./palette-color";

/**
 * Parse a Lospec `.hex` palette: one `RRGGBB` (or `#RRGGBB`) per line. Blank
 * lines and lines that are not valid hex colours are skipped, so a file with a
 * trailing newline or stray whitespace parses cleanly. This is the robust
 * file-based Lospec import path (their site offers `.hex` export directly).
 *
 * @example
 * parseHex("ff0000\n00ff00\n"); // two colours, red then green
 */
export const parseHex = (
	text: string,
): ReadonlyArray<PaletteColor> => {
	const colors: PaletteColor[] = [];
	for (const line of text.split(/\r?\n/)) {
		const color = hexToPaletteColor(line);
		if (color) {
			colors.push(color);
		}
	}
	return colors;
};

/** Serialize colours to Lospec `.hex` text: one lowercase `rrggbb` per line. */
export const serializeHex = (
	colors: ReadonlyArray<PaletteColor>,
): string =>
	`${colors
		.map((color) => paletteColorToHex(color).slice(1))
		.join("\n")}\n`;
