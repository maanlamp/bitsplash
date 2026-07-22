/**
 * Orthogonal, tool-independent drawing modifiers.
 *
 * Modifiers compose _across_ tools rather than being baked into any single
 * tool: a brush, a line, and a fill all paint through the same active ink and
 * symmetry. This is what lets ~20 tools share one paint path instead of each
 * re-implementing alpha-lock, mirroring, and so on.
 *
 * Symmetry (`horizontal`/`vertical`, mirrored in the paint sink), pixel-perfect
 * (an L-bend corner post-processor on freehand strokes), the stabilizer (a
 * lazy-follow smoother on freehand strokes), the `alpha-lock` ink (paints only
 * over already-opaque cel pixels) and the `shading` ink (walks the working
 * palette ramp — see `inks.ts`) are all implemented. Adding a behaviour is
 * implementing the modifier, never editing tool code.
 */

/** How a paint/erase operation writes into the target pixels. */
export type InkMode = "normal" | "alpha-lock" | "shading";

/** Mirror axis applied to paint operations, or `off`. */
export type SymmetryMode = "off" | "horizontal" | "vertical";

/**
 * The full modifier set carried on the editor state. Readonly: a new set is
 * published on every change so subscribers (and `useSyncExternalStore`) see a
 * fresh identity.
 */
export type SpriteModifiers = Readonly<{
	/** Active ink. `normal`, `alpha-lock` and `shading` are all implemented. */
	ink: InkMode;
	/** Mirror axis, implemented: paint/erase/shapes/fill mirror about the centre. */
	symmetry: SymmetryMode;
	/** Pixel-perfect stroke thinning (implemented for the freehand brush/eraser). */
	pixelPerfect: boolean;
	/**
	 * Stroke stabilizer strength (a 0–100 lazy-follow amount). `0` disables (the
	 * raw stroke); higher values smooth and lag freehand strokes more.
	 */
	stabilizer: number;
}>;

/**
 * The modifier set that reproduces the pre-tool-strategy behaviour exactly:
 * normal ink, no symmetry, no pixel-perfect, no stabilization.
 */
export const DEFAULT_MODIFIERS: SpriteModifiers = {
	ink: "normal",
	symmetry: "off",
	pixelPerfect: false,
	stabilizer: 0,
};
