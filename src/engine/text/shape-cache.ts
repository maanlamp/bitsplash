import {
	UnicodeBuffer,
	glyphBufferToShapedGlyphs,
	shape,
} from "text-shaper";
import type { FontStyle, LoadedFont } from "../load";

/**
 * Shaped runs, kept so a string is shaped once instead of once per frame.
 *
 * Shaping a run allocates a `UnicodeBuffer`, a shaper result and one object per
 * glyph, and the UI redraws the same strings every frame — a label that never
 * changes was paying full shaping cost hundreds of times a second. Text content
 * turns over slowly, so a plain memo on `(font, style, text)` collapses that to
 * one shape per distinct string.
 *
 * Entries hold numbers only, and are read-only once built, so a cached run can
 * be handed out directly rather than copied.
 */
export type ShapedRun = Readonly<{
	/** Glyph ids in visual order. */
	ids: ReadonlyArray<number>;
	/** Advance per glyph in font units, parallel to {@link ids}. */
	advances: ReadonlyArray<number>;
	/** Sum of {@link advances}, in font units. */
	totalAdvance: number;
}>;

/**
 * Distinct strings held per font before the cache is dropped wholesale.
 *
 * Generated text — counters, timers, coordinates — produces endless distinct
 * strings, so the cache needs a ceiling or it is a leak. Clearing everything at
 * the ceiling costs one re-shape of whatever is still on screen, which is a
 * handful of runs; an eviction policy that tracked recency would cost more
 * bookkeeping per lookup than it saves.
 */
const MAX_RUNS_PER_FONT = 4096;

const EMPTY: ShapedRun = { ids: [], advances: [], totalAdvance: 0 };

/** One map per style, indexed by the style bits. */
type FontCache = Map<string, ShapedRun>[];

const caches = new WeakMap<LoadedFont, FontCache>();

const cacheFor = (
	font: LoadedFont,
	style: FontStyle,
): Map<string, ShapedRun> => {
	let byStyle = caches.get(font);
	if (!byStyle) {
		byStyle = [new Map(), new Map(), new Map(), new Map()];
		caches.set(font, byStyle);
	}
	let runs = byStyle[style];
	if (!runs) {
		runs = new Map();
		byStyle[style] = runs;
	}
	if (runs.size >= MAX_RUNS_PER_FONT) {
		runs.clear();
	}
	return runs;
};

/**
 * Shape `text` in `font`'s `style`, reusing the previous result when the same
 * string has been shaped before.
 *
 * The returned run is shared and must not be mutated or retained past the point
 * where the caller has read the numbers it needs.
 *
 * @example
 * const run = shapeRun(font, STYLE_REGULAR, label);
 * const width = run.totalAdvance * font.faces[STYLE_REGULAR].scale;
 */
export const shapeRun = (
	font: LoadedFont,
	style: FontStyle,
	text: string,
): ShapedRun => {
	if (text.length === 0) {
		return EMPTY;
	}
	const runs = cacheFor(font, style);
	const hit = runs.get(text);
	if (hit) {
		return hit;
	}
	const buffer = new UnicodeBuffer();
	buffer.addStr(text);
	const shaped = glyphBufferToShapedGlyphs(
		shape(font.faces[style].shape, buffer),
	);
	const ids: number[] = [];
	const advances: number[] = [];
	let totalAdvance = 0;
	for (const glyph of shaped) {
		ids.push(glyph.glyphId);
		advances.push(glyph.xAdvance);
		totalAdvance += glyph.xAdvance;
	}
	const run: ShapedRun = { ids, advances, totalAdvance };
	runs.set(text, run);
	return run;
};
