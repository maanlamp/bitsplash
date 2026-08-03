import type { Seconds } from "../duration";
import type { ReadonlyECS } from "../ecs";
import { windEnvelope } from "./gust";
import { type WeatherFrame, weatherFrame } from "./weather-frame";

/**
 * The wind every visible thing listens to: signed horizontal strength at a world
 * point and a time.
 *
 * Sign is direction — negative blows left — so a consumer can multiply straight
 * into an offset. The magnitude is the **indoor-masked** wind times the wind
 * field at `(x, y)`, which is why foliage stills and rain stops inside without
 * any consumer knowing what `indoor` means. Audio deliberately does not come
 * through here: it reads the raw scalars off {@link weatherFrame} and muffles
 * them with exposure instead, because a storm heard from a cave is quiet, not
 * absent.
 *
 * The frame's scalars are the envelope — they set how hard it can blow anywhere
 * — and {@link windEnvelope} varies the strength and gustiness *within* that
 * envelope, so a calm preset is calm everywhere and a gale gusts unevenly across
 * the level. Gust cells travel downwind, so the same squall reaches a point and
 * then the point beyond it.
 *
 * The scalars come from the frame published by `WeatherPresentationSystem`, so
 * everything sampling in one frame agrees; the field is computed from the
 * position and `t` you pass, so a consumer may look ahead or behind for a
 * per-instance phase offset. Nothing here is stateful: two consumers sampling
 * the same point and time get the same number.
 *
 * @example
 * const lean = sampleWind(ecs, position.x, position.y, ambientTime(ecs));
 * const shear = lean * sprite.height * 0.25;
 */
export const sampleWind = (
	ecs: ReadonlyECS,
	x: number,
	y: number,
	t: Seconds,
): number => sampleWindFrame(weatherFrame(ecs), x, y, t);

/**
 * {@link sampleWind} against a frame the caller already holds.
 *
 * `weatherFrame` memoizes per world, so this returns the identical number — it
 * just skips the lookup. A loop sampling per particle, per ribbon or per sprite
 * resolves the frame once above it and calls this inside.
 *
 * @example
 * const frame = weatherFrame(ecs);
 * for (let i = 0; i < pool.count; i++) {
 *   const wind = sampleWindFrame(frame, pool.x[i]!, pool.y[i]!, t);
 * }
 */
export const sampleWindFrame = (
	frame: WeatherFrame,
	x: number,
	y: number,
	t: Seconds,
): number =>
	frame.visibleWind *
	windEnvelope(x, y, t, frame.visibleWind, frame.direction) *
	frame.direction;
