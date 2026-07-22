import { paletteColor, paletteColorToCss } from "./palette-color";
import { spritePalette } from "./palette-state";
import { shadeColor } from "./palette-shading";
import type { InkMode } from "./sprite-modifiers";
import type { SpriteDocument } from "./sprite-document";

/**
 * An ink decides how a single pixel write lands in the document. Tools never
 * touch the document directly for painting; they call {@link paintWithInk} /
 * {@link eraseWithInk}, which route through the active ink. Symmetry, brush
 * shape, and interpolation live above the ink (they decide _which_ cells);
 * the ink decides _how_ each cell is written.
 */
export type Ink = Readonly<{
	/** Write `css` at document pixel `(x, y)`. */
	paint: (
		doc: SpriteDocument,
		x: number,
		y: number,
		css: string,
	) => void;
	/** Clear document pixel `(x, y)`. */
	erase: (doc: SpriteDocument, x: number, y: number) => void;
}>;

const normal: Ink = {
	paint: (doc, x, y, css) => doc.setPixel(x, y, css),
	erase: (doc, x, y) => doc.erasePixel(x, y),
};

/**
 * Whether an alpha-lock write is allowed at a pixel with the given cel alpha
 * (`0..255`). Locked to already-opaque pixels: a positive alpha passes,
 * transparency is protected. Extracted as a pure predicate so the ink decision
 * is unit tested without a document.
 */
export const alphaLockAllows = (celAlpha: number): boolean =>
	celAlpha > 0;

/**
 * Alpha-lock (preserve-transparency) ink: paint and erase land **only** where
 * the target cel is already opaque, so a stroke recolours an existing silhouette
 * without spilling into transparent pixels. Composes with every tool through the
 * paint sink, since the ink decides only _how_ a cell is written.
 */
const alphaLock: Ink = {
	paint: (doc, x, y, css) => {
		if (alphaLockAllows(doc.activeCelAlpha(x, y))) {
			doc.setPixel(x, y, css);
		}
	},
	erase: (doc, x, y) => {
		if (alphaLockAllows(doc.activeCelAlpha(x, y))) {
			doc.erasePixel(x, y);
		}
	},
};

/**
 * Shading ink: instead of writing the active colour, shift the pixel already in
 * the cel one step **forward** along the working-palette ramp (Aseprite's
 * shading behaviour). Reads the active cel's committed colour, finds it in
 * {@link spritePalette}, and paints its forward neighbour; a pixel that is not a
 * fully-opaque exact palette entry is left untouched, and the ramp end stops
 * (see {@link shadeColor}). Composes with every tool through the paint sink like
 * the other inks — the tool decides which cells, the ink decides the new colour.
 *
 * Only the forward direction is wired (the primary/left-click paint path); the
 * pure {@link shadeColor} already supports `backward`, but the paint sink carries
 * no button, so reverse shading has no gesture yet (flagged).
 */
const shading: Ink = {
	paint: (doc, x, y) => {
		const rgba = doc.activeCelColorAt(x, y);
		if (!rgba || rgba[3] !== 255) {
			return;
		}
		const next = shadeColor(
			spritePalette.colors,
			paletteColor(rgba[0], rgba[1], rgba[2]),
			"forward",
		);
		if (next) {
			doc.setPixel(x, y, paletteColorToCss(next));
		}
	},
	erase: (doc, x, y) => doc.erasePixel(x, y),
};

/**
 * Registry of inks keyed by {@link InkMode}. `shading` walks the working palette
 * (see above); `alpha-lock` preserves transparency; `normal` writes directly.
 */
export const INKS: Readonly<Record<InkMode, Ink>> = {
	normal,
	"alpha-lock": alphaLock,
	shading,
};

/** Paint `css` at `(x, y)` through the given ink mode. */
export const paintWithInk = (
	doc: SpriteDocument,
	ink: InkMode,
	x: number,
	y: number,
	css: string,
): void => {
	INKS[ink].paint(doc, x, y, css);
};

/** Erase `(x, y)` through the given ink mode. */
export const eraseWithInk = (
	doc: SpriteDocument,
	ink: InkMode,
	x: number,
	y: number,
): void => {
	INKS[ink].erase(doc, x, y);
};
