import { describe, expect, test } from "bun:test";
import { STYLE_BOLD, STYLE_REGULAR } from "../src/engine/load";
import {
	parseRichText,
	wrapRichText,
} from "../src/engine/text/rich-text";
import {
	measureText,
	syntheticBoldExtra,
} from "../src/engine/text/text-layout";
import { UI_FONT } from "../src/game/dialogue/dialogue-ui";
import { realFont } from "./support/real-fonts";

/**
 * Measured width has to be the width text is actually drawn at.
 *
 * A run is measured in one place (layout, wrapping, bubble sizing) and stepped
 * glyph by glyph in another (the atlas). When those disagreed — a measure path
 * that ignored synthetic bold — a bold run measured a pixel per glyph short of
 * where it drew, so the last glyph fell outside whatever box was sized for it.
 */
describe("text width", () => {
	test("measuring a run equals stepping its glyphs", async () => {
		const font = await realFont(UI_FONT);
		for (const style of [STYLE_REGULAR, STYLE_BOLD] as const) {
			const text = "Wave goodbye";
			let stepped = 0;
			for (const char of text) {
				stepped += measureText(font, char, style);
			}
			// Per-character stepping is what rich text does to place glyphs;
			// whole-run measurement is what sizes the box around them.
			expect(measureText(font, text, style)).toBeCloseTo(stepped, 5);
		}
	});

	test("a bold run is measured wider when the face is synthetic", async () => {
		const font = await realFont(UI_FONT);
		const extra = syntheticBoldExtra(font.faces[STYLE_BOLD]);
		if (extra === 0) {
			// This typeface ships a real bold face, so there is no smear to
			// account for and nothing this test can distinguish.
			return;
		}
		const text = "Wave goodbye";
		const bold = measureText(font, text, STYLE_BOLD);
		const shapedOnly = bold - extra * Array.from(text).length;
		expect(bold).toBeGreaterThan(shapedOnly);
	});

	test("a wrapped bold line reports the width it lays out to", async () => {
		const font = await realFont(UI_FONT);
		const lines = wrapRichText(
			font,
			parseRichText("[b]Wave goodbye[/b]"),
			Number.POSITIVE_INFINITY,
		);
		const glyphs = lines[0]?.glyphs ?? [];
		expect(glyphs.length).toBeGreaterThan(0);
		const last = glyphs[glyphs.length - 1]!;
		// What `lineWidth` computes: the last glyph's pen position plus its own
		// advance, measured in that glyph's style.
		const width = last.x + measureText(font, last.char, last.style);
		let stepped = 0;
		for (const glyph of glyphs) {
			stepped += measureText(font, glyph.char, glyph.style);
		}
		expect(width).toBeCloseTo(stepped, 5);
	});
});
