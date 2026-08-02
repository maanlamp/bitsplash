import { approach } from "../approach";
import { clamp01, smoothstep } from "../noise";
import { TILE_SIZE } from "../tilemap/tile";
import type { WeatherChannels } from "./channels";
import {
	EXPOSURE_MAX_DISTANCE,
	EXPOSURE_RADIUS_TILES,
} from "./exposure-field";
import { gustEnvelopeCeiling } from "./gust";

/**
 * The arithmetic behind weather ambience: weather scalars and listener shelter in,
 * per-voice gain / filter frequency / pan out.
 *
 * All of it is pure, which is the point — WebAudio does not exist headlessly, so
 * the mapping is the only part of the sound that can be tested at all, and none of
 * it is allowed to live inside the node graph.
 *
 * Two ideas drive the numbers:
 *
 * - **Gain and frequency move together.** Farnell's wind recipe: a noise bed whose
 *   level rises but whose spectrum stays put reads as a volume knob on a hiss.
 *   Every voice's filter frequency tracks wind speed alongside its gain, and the
 *   higher voices come in on steeper curves so a breeze is only the bed and a gale
 *   is all three.
 * - **Shelter attenuates; it never mutes.** The muffle is a floor-bearing
 *   multiplier plus a spectral tilt, so a sealed room is a dark, quiet, off-centre
 *   storm rather than silence. That is the whole reason audio reads the **raw**
 *   weather scalars and not the indoor-masked pair the visuals read.
 */

/** One voice's live parameters. */
export type VoiceMix = Readonly<{
	gain: number;
	/** Filter centre/cutoff in Hz. */
	frequency: number;
	/** Stereo position, `-1..1`. */
	pan: number;
}>;

/**
 * Every voice in the ambience, one frame's worth.
 *
 * Wind is three voices — a broad turbulence bed plus two resonances. Rain is
 * two, a bright patter and a dark roar crossfaded by intensity so heavier rain
 * arrives by filling in rather than by switching. Sand is two, a hiss bed and a
 * mid band, because blowing sand is heard as abrasion rather than as impacts.
 *
 * **Snow has no voice, deliberately.** Falling snow is very nearly silent, and
 * that silence under a visible blizzard is the effect, not an omission. What a
 * listener actually hears in one is the wind, which already has three voices.
 */
export type WeatherAudioMix = Readonly<{
	bed: VoiceMix;
	eave: VoiceMix;
	whistle: VoiceMix;
	rainLight: VoiceMix;
	rainHeavy: VoiceMix;
	sandHiss: VoiceMix;
	sandMid: VoiceMix;
}>;

/**
 * The weather the listener would hear with nothing in the way.
 *
 * `wind` and `precipitation` are the **raw** values off `effectiveWeather` /
 * `weatherFrame` — never `visibleWind` / `visiblePrecipitation`, which are masked
 * to zero indoors for the benefit of foliage and particles.
 */
export type WeatherAudioInput = Readonly<{
	wind: number;
	precipitation: WeatherChannels;
	/** Gust envelope, ~`0.6..1.8`, straight off `gustEnvelope`. */
	gust: number;
	/**
	 * How much of the near field survives the camera's standoff, `0..1` —
	 * `distanceLevel(metresOf(listener.z), PRECIPITATION_HALF_LEVEL_METRES)`.
	 *
	 * **Attenuates precipitation only.** Wind is the air the listener is standing
	 * in rather than a thing at a distance, so it does not recede with the camera.
	 */
	proximity: number;
}>;

/**
 * How the listener's surroundings stand between them and the weather, after
 * smoothing.
 */
export type ShelterState = Readonly<{
	/** Openness of the listener's position, `0..1`. */
	openness: number;
	/** Path distance to the nearest opening in world units. */
	distance: number;
	/** Stereo position the openings lie in, `-1..1`. */
	pan: number;
}>;

/**
 * Time constant of the shelter smoothing, in seconds.
 *
 * `exposure.ts` deliberately smooths nothing, so this is where a doorway stops
 * being a step change. Long enough that walking through a door is a swell rather
 * than a switch, short enough that it is not lagging behind the player.
 */
const SHELTER_TAU = 0.25;

/** Offset that puts a rain anchor hard to one side, in world units. */
const PAN_SPAN = EXPOSURE_RADIUS_TILES * TILE_SIZE;

/**
 * Share of full level that survives with nothing open near the listener.
 *
 * Shelter attenuates once and only once — openness enters {@link WeatherAudioMix}
 * through this factor alone. An earlier version multiplied it in again per voice,
 * which stacked to a ~70% cut one tile under an eave and made stepping under a
 * ledge sound like stepping into a different level.
 */
const MUFFLE_FLOOR = 0.45;

/** Share of full level that survives at maximum shelter distance. */
const DISTANCE_GAIN_FLOOR = 0.6;

/** Share of clarity that survives at maximum shelter distance. */
const DISTANCE_CLARITY_FLOOR = 0.4;

/**
 * Share of a voice's frequency that survives full muffling.
 *
 * High on purpose. Cutoff is the one parameter a listener hears as *movement*
 * rather than as level, so shelter is allowed only a modest darkening — walking
 * around a cave mouth should not sweep a filter.
 */
const TILT_FLOOR = 0.75;

/**
 * Share of the band-pass voices that survives being fully enclosed.
 *
 * Resonances are the first thing shelter takes away — a cave keeps the low
 * rumble long after the whistle through the eaves has gone — so these lead the
 * muffle rather than tracking it. They are floors, not multipliers, because
 * multiplying openness in again is what made a single tile of cover sound like a
 * different level.
 */
const EAVE_SHELTERED_FLOOR = 0.7;
const WHISTLE_SHELTERED_FLOOR = 0.5;

const BED_GAIN = 0.34;
const BED_LO_HZ = 400;
const BED_HI_HZ = 1100;

const EAVE_GAIN = 0.24;
const EAVE_LO_HZ = 160;
const EAVE_HI_HZ = 320;
const EAVE_Q = 3;

const WHISTLE_GAIN = 0.16;
const WHISTLE_LO_HZ = 380;
const WHISTLE_HI_HZ = 800;
const WHISTLE_Q = 8;

const RAIN_GAIN = 0.4;
const RAIN_LIGHT_LO_HZ = 2500;
const RAIN_LIGHT_HI_HZ = 5000;
const RAIN_HEAVY_LO_HZ = 700;
const RAIN_HEAVY_HI_HZ = 2000;

/**
 * How rain level follows the scalar.
 *
 * Above one, so the quiet end stays quiet: a `0.3` scalar reads as a light
 * patter rather than as weather to shelter from, while full rain is at full
 * level.
 */
const RAIN_CURVE = 1.6;

/**
 * Precipitation at which the heavy bed is half way in, and over what span.
 *
 * The knee sits well above the point rain becomes visible, so a shower is the
 * light voice alone and the dark roar is what a downpour adds.
 */
const RAIN_HEAVY_KNEE = 0.5;
const RAIN_HEAVY_SPAN = 0.45;

/**
 * Blowing sand: a broad hiss of grains in the air plus a mid band for the ones
 * hitting things. Quieter than rain at the same weight — sand is abrasive rather
 * than percussive, and the wind voices carry most of a sandstorm.
 */
/**
 * Distance in metres at which precipitation is at half level.
 *
 * Far shorter than the default {@link distanceLevel} half-distance, which is
 * tuned for thunder rolling across kilometres. Rain on the ground is a near-field
 * bed: from a few hundred metres up it is simply not there, and a fully
 * zoomed-out editor camera stands about that far off the plane.
 */
export const PRECIPITATION_HALF_LEVEL_METRES = 35;

/**
 * The hiss is deliberately the quiet half of sand.
 *
 * It sits where the ear is most sensitive, so at anything like the mid band's
 * level it stops reading as grit in the air and starts being fatiguing. Sand is
 * heard as a low roar with abrasion on top, not as the abrasion alone.
 */
const SAND_HISS_GAIN = 0.05;
const SAND_HISS_LO_HZ = 800;
const SAND_HISS_HI_HZ = 1800;

const SAND_MID_GAIN = 0.3;
const SAND_MID_LO_HZ = 320;
const SAND_MID_HI_HZ = 700;
const SAND_MID_Q = 0.7;

/** Resonance of the sand mid band, for the graph that builds it. */
export const SAND_VOICE_Q = { mid: SAND_MID_Q } as const;

/** Resonance of the two band-pass wind voices, for the graph that builds them. */
export const WIND_VOICE_Q = {
	eave: EAVE_Q,
	whistle: WHISTLE_Q,
} as const;

const lerp = (from: number, to: number, t: number): number =>
	from + (to - from) * t;

/**
 * The shelter a listener is actually in, straight off the exposure field with no
 * smoothing yet.
 *
 * @example
 * const { distance, centroid } = rainAudioAnchor(ecs, x, y);
 * const target = shelterTarget(exposureAt(ecs, x, y), distance, x, centroid.x);
 */
export const shelterTarget = (
	openness: number,
	distance: number,
	listenerX: number,
	centroidX: number,
): ShelterState => ({
	openness: clamp01(openness),
	distance: Math.max(0, Math.min(distance, EXPOSURE_MAX_DISTANCE)),
	pan: Math.max(-1, Math.min((centroidX - listenerX) / PAN_SPAN, 1)),
});

/**
 * One smoothing step of the shelter state toward what the geometry says now.
 *
 * @example
 * this.shelter = smoothShelter(this.shelter, shelterTarget(...), time.dt);
 */
export const smoothShelter = (
	current: ShelterState,
	target: ShelterState,
	dt: number,
): ShelterState => ({
	openness: approach(
		current.openness,
		target.openness,
		dt,
		SHELTER_TAU,
	),
	distance: approach(
		current.distance,
		target.distance,
		dt,
		SHELTER_TAU,
	),
	pan: approach(current.pan, target.pan, dt, SHELTER_TAU),
});

/**
 * The whole ambience for one frame.
 *
 * Every channel is read here, not just one: rain crossfades light into heavy,
 * sand adds its two voices, and snow contributes nothing at all.
 *
 * @example
 * const mix = weatherAudioMix(
 * 	{ wind: frame.wind, precipitation: frame.precipitation, gust },
 * 	shelter,
 * );
 */
export const weatherAudioMix = (
	input: WeatherAudioInput,
	shelter: ShelterState,
): WeatherAudioMix => {
	// Gain rides the gust; cutoff deliberately does not. A cutoff following the
	// envelope reads as a wah pedal rather than as weather, so spectral brightness
	// tracks the eased wind scalar alone, which only moves as the weather itself
	// does. The envelope is normalised against its own ceiling rather than
	// clamped: clamping saturates at a gale, where a gust could then only pull the
	// bed down.
	const spectral = clamp01(input.wind);
	const speed =
		(spectral * input.gust) / gustEnvelopeCeiling(input.wind);
	const reach = clamp01(shelter.distance / EXPOSURE_MAX_DISTANCE);
	const muffle =
		(MUFFLE_FLOOR + (1 - MUFFLE_FLOOR) * shelter.openness) *
		lerp(1, DISTANCE_GAIN_FLOOR, reach);
	const clarity =
		shelter.openness * lerp(1, DISTANCE_CLARITY_FLOOR, reach);
	const tilt = TILT_FLOOR + (1 - TILT_FLOOR) * clarity;

	const near = clamp01(input.proximity);
	const wet = clamp01(input.precipitation.rain);
	const level = RAIN_GAIN * wet ** RAIN_CURVE * muffle * near;
	const heavy = smoothstep((wet - RAIN_HEAVY_KNEE) / RAIN_HEAVY_SPAN);
	const rainPan = shelter.pan * (1 - shelter.openness);

	const grit = clamp01(input.precipitation.sand);
	const sandLevel = grit ** 0.7 * muffle * near;

	return {
		bed: {
			gain: BED_GAIN * speed * muffle,
			frequency: lerp(BED_LO_HZ, BED_HI_HZ, spectral) * tilt,
			pan: 0,
		},
		eave: {
			gain:
				EAVE_GAIN *
				speed *
				speed *
				muffle *
				lerp(EAVE_SHELTERED_FLOOR, 1, clarity),
			frequency: lerp(EAVE_LO_HZ, EAVE_HI_HZ, spectral),
			pan: 0,
		},
		whistle: {
			gain:
				WHISTLE_GAIN *
				speed *
				speed *
				speed *
				muffle *
				lerp(WHISTLE_SHELTERED_FLOOR, 1, clarity),
			frequency: lerp(WHISTLE_LO_HZ, WHISTLE_HI_HZ, spectral),
			pan: 0,
		},
		rainLight: {
			gain: level * Math.sqrt(1 - heavy),
			frequency: lerp(RAIN_LIGHT_LO_HZ, RAIN_LIGHT_HI_HZ, wet) * tilt,
			pan: rainPan,
		},
		rainHeavy: {
			gain: level * Math.sqrt(heavy),
			frequency: lerp(RAIN_HEAVY_LO_HZ, RAIN_HEAVY_HI_HZ, wet) * tilt,
			pan: rainPan,
		},
		sandHiss: {
			gain: SAND_HISS_GAIN * sandLevel,
			frequency: lerp(SAND_HISS_LO_HZ, SAND_HISS_HI_HZ, grit) * tilt,
			pan: rainPan,
		},
		sandMid: {
			gain: SAND_MID_GAIN * sandLevel * speed,
			frequency: lerp(SAND_MID_LO_HZ, SAND_MID_HI_HZ, grit),
			pan: rainPan,
		},
	};
};
