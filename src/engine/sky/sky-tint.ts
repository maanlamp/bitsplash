import type { MutableRGBA } from "../animation/keyframes";
import { clamp01 } from "../noise";
import type { RGBA } from "../render/color-resolver";
import {
	WEATHER_CHANNELS,
	type WeatherChannel,
	type WeatherChannels,
} from "../weather/channels";

/**
 * One channel's pull on the sky: the colour it drags toward, and how much of
 * the way there a fully-saturated channel gets.
 */
type SkyWash = Readonly<{
	color: RGBA;
	/** Mix weight at channel `1.0`, `0..1`. Never 1 — the authored hue survives. */
	strength: number;
}>;

/**
 * What each precipitation channel does to the sky it falls out of. Keyed by
 * {@link WeatherChannel}, so adding a channel is a type error here until it
 * declares what its sky looks like.
 *
 * The numbers are a starting look, not a measurement — rain to a heavy
 * blue-grey overcast, sand to a dust-lit ochre, snow flattened toward the
 * near-white of a low snow sky. They are the only judgement in this file and
 * the one thing a person has to accept by eye.
 */
const WASHES: Readonly<Record<WeatherChannel, SkyWash>> = {
	rain: { color: [0.13, 0.15, 0.19, 1], strength: 0.78 },
	snow: { color: [0.84, 0.86, 0.9, 1], strength: 0.7 },
	sand: { color: [0.6, 0.44, 0.2, 1], strength: 0.85 },
};

/**
 * Write the sky's drawn colour for this frame into `out`: the authored colour
 * with each channel's wash mixed over it in {@link WEATHER_CHANNELS} order, so
 * a rain-to-snow crossfade passes through both rather than snapping.
 *
 * Alpha is the authored alpha untouched — weather changes what the sky looks
 * like, never whether there is one. Calm weather reproduces the authored colour
 * exactly, so a scene with no climate draws precisely what was authored.
 *
 * The caller supplies `out` so the per-frame draw allocates nothing.
 *
 * @example
 * skyTintInto(tint, sky.color.rgba, weatherFrame(ecs).visiblePrecipitation);
 */
export const skyTintInto = (
	out: MutableRGBA,
	base: RGBA,
	precipitation: WeatherChannels,
): void => {
	out[0] = base[0];
	out[1] = base[1];
	out[2] = base[2];
	out[3] = base[3];
	for (const channel of WEATHER_CHANNELS) {
		const wash = WASHES[channel];
		const weight = clamp01(precipitation[channel]) * wash.strength;
		if (weight <= 0) {
			continue;
		}
		out[0] += (wash.color[0] - out[0]) * weight;
		out[1] += (wash.color[1] - out[1]) * weight;
		out[2] += (wash.color[2] - out[2]) * weight;
	}
};
