import { clamp01 } from "../../engine/noise";
import { distanceLevel } from "../../engine/listener";
import {
	takesFor,
	type ThunderRole,
	type ThunderTake,
} from "./thunder-bank";

/**
 * Distance placement for a thunderclap: which recordings play, when each one
 * lands, and how the air between the bolt and the listener has treated it.
 *
 * A clap is three layers rather than one file per distance bucket, which is the
 * arrangement that passed audition: the **close** layer is the whip-crack of a
 * strike in the next field, the **crack** layer is the body of the report, and
 * the **rumble** is what the sky does afterwards. Distance decides how much of
 * each is present, how far apart they land, and how much of the top end the air
 * has eaten.
 *
 * Pure, and seeded by the caller: the same strike always places the same clap,
 * so a strike event fully describes its own thunder.
 */

/** Metres per second. */
const SPEED_OF_SOUND = 343;

/** Distance to full close weight, and distance where the close layer is gone. */
const CLOSE_FULL_METRES = 60;
const CLOSE_GONE_METRES = 160;

/** How far the crack ducks under an engaged close layer. */
const CRACK_DUCK = 0.55;

/** Seconds the crack lands behind an engaged close layer. */
const CRACK_LAG = 0.025;

/** Rumble offset: a fixed lag plus this much per kilometre. */
const RUMBLE_LAG = 0.09;
const RUMBLE_LAG_PER_KM = 0.26;

/** Rumble weight floor, and the distance at which it reaches full. */
const RUMBLE_FLOOR = 0.3;
const RUMBLE_FULL_METRES = 2500;

/** Air absorption: cutoff in Hz, and the floor it never goes below. */
const ABSORPTION_HZ = 22000;
const ABSORPTION_SCALE_METRES = 3000;
const ABSORPTION_FLOOR_HZ = 140;

/** Lateral distance in metres at which a clap is panned hard to one side. */
const PAN_FULL_METRES = 30;

/** One layer of a clap, ready to hand to `playBuffer`. */
export type ThunderVoice = Readonly<{
	take: ThunderTake;
	/** Seconds into the take where its strike is. */
	offset: number;
	/** Seconds from now this layer should start. */
	delay: number;
	gain: number;
	/** Air-absorption cutoff, Hz. */
	lowpass: number;
	/** Stereo position, `-1..1`. */
	pan: number;
}>;

const closeWeightAt = (metres: number): number =>
	clamp01(
		(CLOSE_GONE_METRES - metres) /
			(CLOSE_GONE_METRES - CLOSE_FULL_METRES),
	);

/** Air-absorption cutoff at a distance, floored so a far clap is not silent. */
const absorptionHz = (metres: number): number =>
	Math.max(
		ABSORPTION_FLOOR_HZ,
		ABSORPTION_HZ * Math.exp(-metres / ABSORPTION_SCALE_METRES),
	);

const pick = <T>(
	items: readonly T[],
	random: () => number,
): T | null =>
	items.length === 0
		? null
		: items[
				Math.min(
					items.length - 1,
					Math.floor(random() * items.length),
				)
			]!;

const layer = (
	role: ThunderRole,
	metres: number,
	weight: number,
	delay: number,
	level: number,
	lowpass: number,
	pan: number,
	random: () => number,
): ThunderVoice | null => {
	if (weight <= 0) {
		return null;
	}
	const take = pick(takesFor(role, metres), random);
	if (!take) {
		return null;
	}
	const offset = pick(take.strikes, random) ?? 0;
	return {
		take,
		offset,
		delay,
		gain: level * weight,
		lowpass,
		pan,
	};
};

/**
 * Place a clap for a strike `metres` away and `lateral` metres to the side
 * (negative is left of the listener).
 *
 * @param random A seeded generator. Called a fixed number of times per layer, so
 * the same seed places the same clap.
 *
 * @example
 * for (const voice of placeThunder(240, -18, seeded(strike.seed))) {
 * 	audio.playBuffer(buffers.get(voice.take.url)!, { …voice, bus: world.audio.sfx });
 * }
 */
export const placeThunder = (
	metres: number,
	lateral: number,
	random: () => number,
): readonly ThunderVoice[] => {
	const arrival = metres / SPEED_OF_SOUND;
	const level = distanceLevel(metres);
	const lowpass = absorptionHz(metres);
	const pan = Math.max(-1, Math.min(1, lateral / PAN_FULL_METRES));
	const close = closeWeightAt(metres);
	const voices: ThunderVoice[] = [];
	const add = (voice: ThunderVoice | null): void => {
		if (voice) {
			voices.push(voice);
		}
	};
	add(
		layer(
			"close",
			metres,
			close,
			arrival,
			level,
			lowpass,
			pan,
			random,
		),
	);
	add(
		layer(
			"crack",
			metres,
			1 - close * CRACK_DUCK,
			arrival + (close > 0 ? CRACK_LAG : 0),
			level,
			lowpass,
			pan,
			random,
		),
	);
	add(
		layer(
			"rumble",
			metres,
			RUMBLE_FLOOR +
				(1 - RUMBLE_FLOOR) * Math.min(1, metres / RUMBLE_FULL_METRES),
			arrival + RUMBLE_LAG + RUMBLE_LAG_PER_KM * (metres / 1000),
			level,
			lowpass,
			pan,
			random,
		),
	);
	return voices;
};
