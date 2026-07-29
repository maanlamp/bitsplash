import type { Seconds } from "../duration";
import type { ReadonlyECS } from "../ecs";
import { gustEnvelope } from "./gust";
import { weatherFrame } from "./weather-frame";

/**
 * The wind every visible thing listens to: signed horizontal strength at a point
 * and a time.
 *
 * Sign is direction — negative blows left — so a consumer can multiply straight
 * into an offset. The magnitude is the **indoor-masked** wind times the gust
 * envelope, which is why foliage stills and rain stops inside without any
 * consumer knowing what `indoor` means. Audio deliberately does not come through
 * here: it reads the raw scalars off {@link weatherFrame} and muffles them with
 * exposure instead, because a storm heard from a cave is quiet, not absent.
 *
 * The scalars come from the frame published by `WeatherPresentationSystem`, so
 * everything sampling in one frame agrees; the envelope is computed from the `t`
 * you pass, so a consumer may look ahead or behind for a per-instance phase
 * offset.
 *
 * @param _x Reserved for future spatial variation and ignored in v1. Wind is a
 *   global time-varying value everywhere it ships in this genre; position
 *   variation is presentation-side masking, so the signature carries the seam
 *   without the pretence of a simulation.
 *
 * @example
 * const lean = sampleWind(ecs, transform.position.x, ambientTime(ecs));
 * const shear = lean * sprite.height * 0.25;
 */
export const sampleWind = (
	ecs: ReadonlyECS,
	_x: number,
	t: Seconds,
): number => {
	const frame = weatherFrame(ecs);
	return (
		frame.visibleWind *
		gustEnvelope(t, frame.visibleWind) *
		frame.direction
	);
};
