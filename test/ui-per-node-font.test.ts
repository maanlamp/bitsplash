import { expect, test } from "bun:test";
import { MeasureMode } from "yoga-layout";
import type { FontSettings } from "../src/engine/text/font-settings";
import { FontSettings as Font } from "../src/engine/text/font-settings";
import { createTextMeasureProvider } from "../src/engine/ui/layout/measure-text";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";

const textNode = (font?: FontSettings): UiNode => ({
	type: "text",
	props: { children: "hi", style: font ? { font } : {} },
	children: [],
	id: 1,
});

test("measure resolves each text node's own font", () => {
	const seen: Array<FontSettings | undefined> = [];
	const provider = createTextMeasureProvider((font) => {
		seen.push(font);
		return null;
	});

	const custom = new Font("some-font.font.zip", 24);
	const measure = provider(textNode(custom));
	expect(measure).toBeDefined();
	measure!(100, MeasureMode.AtMost, 0, MeasureMode.Undefined);
	expect(seen.at(-1)).toBe(custom);

	const measureDefault = provider(textNode());
	measureDefault!(100, MeasureMode.AtMost, 0, MeasureMode.Undefined);
	expect(seen.at(-1)).toBeUndefined();
});
