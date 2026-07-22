import type { SpriteEditorState } from "./sprite-editor-state";

/**
 * Pressure dynamics: map a raw `PointerEvent.pressure` (0–1) onto brush size and
 * stroke opacity. Kept pure and separate from the tools so the mapping is unit
 * tested in isolation and the same curve drives both the dab footprint and the
 * committed stroke opacity.
 *
 * The one rule that matters for correctness: a reported pressure of `0` means
 * "this device has no pressure information" (most mice report a constant `0`,
 * some a constant `0.5`) — it must be treated as **full** pressure, never as a
 * vanishing brush. See {@link effectivePressure}.
 */

/**
 * Normalise a raw pointer pressure into a usable 0–1 factor, treating `0`
 * (no pressure info) as full pressure and clamping to `[0, 1]`.
 *
 * @example
 * effectivePressure(0);    // 1   (mouse: no pressure info ⇒ full)
 * effectivePressure(0.5);  // 0.5
 * effectivePressure(1.4);  // 1   (clamped)
 */
export const effectivePressure = (raw: number): number => {
	if (!(raw > 0)) {
		return 1;
	}
	return raw > 1 ? 1 : raw;
};

/**
 * Scale a base brush diameter by pressure, flooring at a single pixel so the
 * brush never disappears. Linear curve (the conventional default).
 *
 * @example
 * pressureToSize(8, 1);    // 8
 * pressureToSize(8, 0.5);  // 4
 * pressureToSize(8, 0.01); // 1  (floored)
 */
export const pressureToSize = (
	baseSize: number,
	pressure: number,
): number => Math.max(1, Math.round(baseSize * pressure));

/**
 * Scale a base opacity (0–1) by pressure. Linear curve.
 *
 * @example
 * pressureToOpacity(1, 0.5);   // 0.5
 * pressureToOpacity(0.8, 0.5); // 0.4
 */
export const pressureToOpacity = (
	baseOpacity: number,
	pressure: number,
): number => baseOpacity * pressure;

/**
 * The brush diameter a dab should use for `pressure`, honouring the editor's
 * pressure→size toggle. When the toggle is off, the base size is returned
 * unchanged; when on, the pressure-scaled size is used (with `0` pressure
 * treated as full — see {@link effectivePressure}).
 */
export const effectiveBrushSize = (
	state: SpriteEditorState,
	pressure: number,
): number =>
	state.pressureSize
		? pressureToSize(state.brushSize, effectivePressure(pressure))
		: state.brushSize;

/**
 * The opacity multiplier a freehand stroke should commit at for `pressure`,
 * honouring the editor's pressure→opacity toggle. Returns `1` (no scaling) when
 * the toggle is off. Applied once per stroke against the colour's own alpha, in
 * keeping with the single-commit stroke-buffer model.
 */
export const effectiveOpacityScale = (
	state: SpriteEditorState,
	pressure: number,
): number =>
	state.pressureOpacity ? effectivePressure(pressure) : 1;
