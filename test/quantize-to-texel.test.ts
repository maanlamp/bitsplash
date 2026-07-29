import { describe, expect, test } from "bun:test";
import { quantizeToTexel } from "../src/engine/render/quantize";

/**
 * `quantizeToTexel` is the primitive the art direction rests on: manipulation
 * happens in pixel space and is projected into art space by integer upscale, so a
 * transformed edge must land on a whole screen texel rather than between two
 * (`docs/design/game-design-document.md`, Art direction). Its two callers are camera
 * placement (`camera-2d-render.ts`) and foliage sway (`foliage-sway-component.ts`).
 */
describe("quantizeToTexel", () => {
	test("snaps to whole world units at zoom 1", () => {
		expect(quantizeToTexel(10.37, 1)).toBe(10);
		expect(quantizeToTexel(-10.6, 1)).toBe(-11);
	});

	test("snaps to fractional steps as zoom rises", () => {
		expect(quantizeToTexel(10.37, 4)).toBe(10.25);
		expect(quantizeToTexel(10.4, 5)).toBe(10.4);
		expect(quantizeToTexel(10.41, 5)).toBe(10.4);
	});

	test("leaves values already on a texel boundary untouched", () => {
		expect(quantizeToTexel(12, 3)).toBe(12);
		expect(quantizeToTexel(0, 8)).toBe(0);
	});
});
