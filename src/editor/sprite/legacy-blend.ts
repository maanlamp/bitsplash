import type { BlendId } from "../../engine/sprite/bsprite-manifest";

/**
 * The five legacy pixel-math blend modes carried for paint.NET / Aseprite
 * parity. They sit outside the canvas2d {@link GlobalCompositeOperation} union,
 * so the compositor evaluates them with the per-channel loop below rather than
 * `globalCompositeOperation`.
 *
 * @see docs/bsprite-format.md — "Legacy pixel-math"
 */
export type LegacyBlendId =
	| "subtract"
	| "divide"
	| "reflect"
	| "glow"
	| "negation";

const LEGACY_IDS: ReadonlySet<string> = new Set<LegacyBlendId>([
	"subtract",
	"divide",
	"reflect",
	"glow",
	"negation",
]);

/** True when `blend` is one of the five legacy pixel-math modes. */
export const isLegacyBlend = (
	blend: BlendId,
): blend is LegacyBlendId => LEGACY_IDS.has(blend);

/**
 * Evaluate a legacy blend mode for a single channel. `b` (backdrop) and `s`
 * (source) are normalized to `0..1`; the result is the blended channel in
 * `0..1` **before** clamping and alpha compositing (both applied by the
 * compositor).
 *
 * Formulas are verbatim from the format contract:
 * - subtract: `max(0, b - s)`
 * - divide:   `s === 0 ? 1 : min(1, b / s)`
 * - reflect:  `s === 1 ? 1 : min(1, b*b / (1 - s))`
 * - glow:     `b === 1 ? 1 : min(1, s*s / (1 - b))`
 * - negation: `1 - abs(1 - b - s)`
 *
 * @see docs/bsprite-format.md — "Legacy pixel-math"
 */
export const legacyBlendChannel = (
	blend: LegacyBlendId,
	b: number,
	s: number,
): number => {
	switch (blend) {
		case "subtract":
			return Math.max(0, b - s);
		case "divide":
			return s === 0 ? 1 : Math.min(1, b / s);
		case "reflect":
			return s === 1 ? 1 : Math.min(1, (b * b) / (1 - s));
		case "glow":
			return b === 1 ? 1 : Math.min(1, (s * s) / (1 - b));
		case "negation":
			return 1 - Math.abs(1 - b - s);
	}
};
