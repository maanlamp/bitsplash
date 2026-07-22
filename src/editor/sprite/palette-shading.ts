import {
	type PaletteColor,
	paletteColorsEqual,
} from "./palette-color";

/**
 * Which way the shading ink walks the palette ramp. `forward` steps toward the
 * end of the palette order (the primary/left-click direction), `backward` steps
 * toward the start.
 */
export type ShadeDirection = "forward" | "backward";

/**
 * Given the ordered working palette and an existing opaque pixel colour, return
 * the colour it shades to — the neighbour in palette order in `direction` — or
 * `null` when the shift is a no-op:
 *
 * - the pixel colour is **not** an exact entry in the palette (off-palette
 *   pixels are left unchanged), or
 * - the entry is already at the ramp end in that direction (ramp ends **stop**;
 *   they do not wrap).
 *
 * Duplicate palette entries resolve at their first index, so a ramp with a
 * repeated colour still advances deterministically. Pure: no document, no side
 * effects — the shading ink wraps this to decide each pixel's new colour.
 *
 * @example
 * // palette [dark, mid, light]; mid shades forward to light.
 * shadeColor([dark, mid, light], mid, "forward"); // === light
 * shadeColor([dark, mid, light], light, "forward"); // === null (ramp end)
 */
export const shadeColor = (
	palette: ReadonlyArray<PaletteColor>,
	color: PaletteColor,
	direction: ShadeDirection,
): PaletteColor | null => {
	const index = palette.findIndex((entry) =>
		paletteColorsEqual(entry, color),
	);
	if (index < 0) {
		return null;
	}
	const next = direction === "forward" ? index + 1 : index - 1;
	if (next < 0 || next >= palette.length) {
		return null;
	}
	return palette[next]!;
};
