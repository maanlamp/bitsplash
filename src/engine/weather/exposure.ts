import type { ReadonlyECS } from "../ecs";
import { TILE_SIZE } from "../tilemap/tile";
import Vector2 from "../vector2";
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
export const INDOOR_OPENNESS_CEILING = 0.2;

/**
 * Row of the topmost rain-blocking tile in a tile column, or `null` when the
 * column is open to the sky all the way down.
 *
 * Rain falls freely above the returned row and is sheltered below it, so a
 * particle emitter converts it with `row * TILE_SIZE` to get the world height
 * where drops should die.
 *
 * @example
 * const roof = rainHeightAt(ecs, Math.floor(x / TILE_SIZE));
 * const killY = roof === null ? Infinity : roof * TILE_SIZE;
 */
export const rainHeightAt = (
	ecs: ReadonlyECS,
	gx: number,
	centerX = gx * TILE_SIZE,
	centerY = 0,
): number | null =>
	exposureField(ecs, centerX, centerY).rainHeight(gx);

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
 * @example
 * const wetness = exposureAt(ecs, player.x, player.y); // 1 in the open
 */
export const exposureAt = (
	ecs: ReadonlyECS,
	x: number,
	y: number,
): number => {
	const { openness } = exposureField(ecs, x, y).sample(x, y);
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
	).sample(x, y);
	return { distance, centroid: new Vector2(centroidX, centroidY) };
};
