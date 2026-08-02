import type { ReadonlyECS } from "../ecs";
import type { TileBlockingClass } from "../tilemap/occupancy";
import { TILE_SIZE } from "../tilemap/tile";
import Vector2 from "../vector2";
import type { WeatherChannel } from "./channels";
import { sceneIndoor } from "./effective-weather";
import { exposureField } from "./exposure-field";

/**
 * Ceiling openness is clamped to when the scene reads as an interior
 * ({@link sceneIndoor}).
 *
 * An interior can legitimately contain sky-exposed cells — a courtyard tile, a
 * doorway, a broken roof — and would otherwise read as fully outdoors. The clamp
 * keeps the derived geometry honest (a doorway still reads as more open than a
 * back room) while the scene's own answer about being inside wins.
 */
const INDOOR_OPENNESS_CEILING = 0.2;

/**
 * Which authored blocking classification shelters each precipitation channel.
 *
 * All three map onto `"rain-blocking"` today — that is the tri-state
 * `TileLayerComponent` carries, and it is deliberately kept as the authored
 * value. The table is the seam: giving snow its own classification later is a
 * new entry here plus a new field, not a change at any call site.
 */
export const CHANNEL_BLOCKING: Readonly<
	Record<WeatherChannel, TileBlockingClass>
> = {
	rain: "rain-blocking",
	snow: "rain-blocking",
	sand: "rain-blocking",
};

/**
 * Row of the topmost blocking tile in a tile column for a channel, or `null`
 * when the column is open to the sky all the way down.
 *
 * Precipitation falls freely above the returned row and is sheltered below it,
 * so a particle emitter converts it with `row * TILE_SIZE` to get the world
 * height where drops should die.
 *
 * @example
 * const roof = precipitationHeightAt(ecs, Math.floor(x / TILE_SIZE));
 * const killY = roof === null ? Infinity : roof * TILE_SIZE;
 */
export const precipitationHeightAt = (
	ecs: ReadonlyECS,
	gx: number,
	centerX = gx * TILE_SIZE,
	centerY = 0,
	channel: WeatherChannel = "rain",
): number | null =>
	exposureField(
		ecs,
		centerX,
		centerY,
		CHANNEL_BLOCKING[channel],
	).roofHeight(gx);

/**
 * How open to the sky a world-space point is, 0..1.
 *
 * This is soft by construction: the value is the weighted share of sky-exposed
 * air among all the air reachable from the point, so walking under a wide eave
 * fades it down gradually and a single-tile hole in a roof reads as a small
 * fraction rather than flipping the point between sheltered and soaked. A sealed
 * interior is 0 with no special case — nothing exposed is reachable.
 *
 * An `indoor` scene is additionally clamped to
 * {@link INDOOR_OPENNESS_CEILING}. Consumers smooth this over a few hundred
 * milliseconds themselves; no smoothing happens here.
 *
 * The channel selects which blocking classification the shelter is derived from
 * ({@link CHANNEL_BLOCKING}), because "how snowed-on is this point" is a
 * different question from "how rained-on" as soon as the two are sheltered by
 * different geometry. It defaults to rain, so every existing call site keeps
 * asking exactly what it asked before.
 *
 * @example
 * const wetness = exposureAt(ecs, player.x, player.y); // 1 in the open
 * @example
 * const buried = exposureAt(ecs, player.x, player.y, "snow");
 */
export const exposureAt = (
	ecs: ReadonlyECS,
	x: number,
	y: number,
	channel: WeatherChannel = "rain",
): number => {
	const { openness } = exposureField(
		ecs,
		x,
		y,
		CHANNEL_BLOCKING[channel],
	).sample(x, y);
	return sceneIndoor(ecs)
		? Math.min(openness, INDOOR_OPENNESS_CEILING)
		: openness;
};

/** Where the rain a listener hears is coming from, and how far away it is. */
export type RainAudioAnchor = Readonly<{
	/**
	 * Path distance through air to the nearest opening, in world units, clamped
	 * to `EXPOSURE_MAX_DISTANCE`. Drives the muffle: a sealed room reports the
	 * clamp, which is deep muffle rather than silence.
	 */
	distance: number;
	/**
	 * Openness-weighted centroid of the nearby openings, for panning. Weighting
	 * every opening instead of picking the nearest is what keeps a listener
	 * between two windows from flip-flopping across the stereo field. With no
	 * openings nearby this is the listener's own position, so the bed plays
	 * centred.
	 */
	centroid: Vector2;
}>;

/**
 * Distance and direction to place the rain bed for a listener at a world point.
 *
 * @example
 * const { distance, centroid } = rainAudioAnchor(ecs, listener.x, listener.y);
 * const pan = clamp((centroid.x - listener.x) / PAN_SPAN, -1, 1);
 */
export const rainAudioAnchor = (
	ecs: ReadonlyECS,
	x: number,
	y: number,
): RainAudioAnchor => {
	const { distance, centroidX, centroidY } = exposureField(
		ecs,
		x,
		y,
		CHANNEL_BLOCKING.rain,
	).sample(x, y);
	return { distance, centroid: new Vector2(centroidX, centroidY) };
};
