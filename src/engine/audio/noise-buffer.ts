import { rngNext } from "../rng";

/**
 * Source material for synthesized ambience: seeded noise written into a plain
 * `Float32Array`.
 *
 * Kept free of WebAudio on purpose. The caller allocates the storage (an
 * `AudioBuffer` channel in a real host, a bare array in a test), so the generator
 * itself is a pure, deterministic function that can be asserted anywhere.
 *
 * Noise is the right source for wind and rain rather than a recording: both are
 * broadband hiss whose *spectrum* is the thing that has to move with the weather,
 * and a filter sweeping over live noise does that where a crossfade between fixed
 * takes cannot.
 */

/**
 * White noise in `[-1, 1)`, seeded so the same seed always yields the same
 * samples.
 *
 * White noise loops seamlessly by construction: the wrap from the last sample to
 * the first is statistically just another step, so there is no click to hide.
 * Voices sharing one buffer would sum coherently into a single louder copy of
 * itself, so give each voice its own seed.
 *
 * @example
 * fillWhiteNoise(buffer.getChannelData(0), 0x51a7_c3d1);
 */
export const fillWhiteNoise = (
	out: Float32Array,
	seed: number,
): void => {
	let state = seed >>> 0;
	for (let i = 0; i < out.length; i++) {
		const [value, next] = rngNext(state);
		state = next;
		out[i] = value * 2 - 1;
	}
};
