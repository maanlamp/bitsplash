import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/** An 8-bit RGB triple (`0..255`) used for an onion ghost's tint colour. */
export type Rgb = readonly [number, number, number];

/**
 * Onion-skin configuration. `enabled` gates the whole overlay; the counts say
 * how many neighbouring frames to ghost on each side; `opacity` is the strength
 * of the nearest ghost and `falloff` multiplies it for each further step (so
 * distant ghosts fade out); the two tints colour previous vs. next ghosts and
 * `tintStrength` is how far each ghost's pixels are pulled toward its tint.
 */
export type OnionSettings = Readonly<{
	enabled: boolean;
	prevCount: number;
	nextCount: number;
	opacity: number;
	falloff: number;
	prevTint: Rgb;
	nextTint: Rgb;
	tintStrength: number;
}>;

/**
 * One ghost to draw under the active frame: the source `frame` index, the
 * `opacity` to draw it at, and the `tint` to colour it with.
 */
export type OnionGhost = Readonly<{
	frame: number;
	opacity: number;
	tint: Rgb;
}>;

/**
 * Default onion state — **off** by default, with Aseprite-like conventional
 * values: one ghost each side, 50% nearest opacity halving per step, previous
 * frames tinted red and next frames blue. These are UX defaults (see the
 * step-17 report); tune freely.
 */
export const DEFAULT_ONION: OnionSettings = {
	enabled: false,
	prevCount: 1,
	nextCount: 1,
	opacity: 0.5,
	falloff: 0.5,
	prevTint: [255, 80, 80],
	nextTint: [80, 140, 255],
	tintStrength: 0.6,
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The opacity of the ghost `distance` steps from the active frame. */
const ghostOpacity = (
	opacity: number,
	falloff: number,
	distance: number,
): number => clamp01(opacity * falloff ** (distance - 1));

/**
 * Select the ghost frames to draw for a given active frame: up to `prevCount`
 * previous and `nextCount` next frames, each with a distance-based opacity and
 * its side's tint. Frames are **clamped** to `[0, frameCount)` — no wrap — so a
 * frame near either end simply has fewer ghosts. Returns an empty list when
 * onion is disabled or there are no frames.
 *
 * @example
 * onionGhosts(2, 5, { ...DEFAULT_ONION, enabled: true });
 * // → [{ frame: 1, opacity: 0.5, tint: red }, { frame: 3, opacity: 0.5, tint: blue }]
 */
export const onionGhosts = (
	activeFrame: number,
	frameCount: number,
	settings: OnionSettings,
): OnionGhost[] => {
	if (!settings.enabled || frameCount <= 0) {
		return [];
	}
	const ghosts: OnionGhost[] = [];
	for (let d = 1; d <= settings.prevCount; d++) {
		const frame = activeFrame - d;
		if (frame < 0) {
			break;
		}
		ghosts.push({
			frame,
			opacity: ghostOpacity(settings.opacity, settings.falloff, d),
			tint: settings.prevTint,
		});
	}
	for (let d = 1; d <= settings.nextCount; d++) {
		const frame = activeFrame + d;
		if (frame >= frameCount) {
			break;
		}
		ghosts.push({
			frame,
			opacity: ghostOpacity(settings.opacity, settings.falloff, d),
			tint: settings.nextTint,
		});
	}
	return ghosts;
};

/**
 * Colour a ghost frame toward its tint: every non-transparent pixel's RGB is
 * lerped toward `tint` by `strength` (`0` keeps the original colours, `1` makes
 * a solid-tint silhouette); alpha is untouched. Pure — returns a fresh buffer,
 * so the source frame image is never mutated.
 */
export const tintPixels = (
	source: PixelBuffer,
	tint: Rgb,
	strength: number,
): PixelBuffer => {
	const { width, height, data } = source;
	const out = blankPixels(width, height);
	const od = out.data;
	const k = clamp01(strength);
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3]!;
		if (a === 0) {
			continue;
		}
		od[i] = Math.round(data[i]! * (1 - k) + tint[0] * k);
		od[i + 1] = Math.round(data[i + 1]! * (1 - k) + tint[1] * k);
		od[i + 2] = Math.round(data[i + 2]! * (1 - k) + tint[2] * k);
		od[i + 3] = a;
	}
	return out;
};
