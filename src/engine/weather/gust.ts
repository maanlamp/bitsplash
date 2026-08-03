import type { Seconds } from "../duration";
import {
	clamp01,
	hashUnit2,
	smoothstep,
	valueNoise2,
} from "../noise";

/**
 * The shared wind field — Farnell's wind decomposition, stateless and spatial.
 *
 * One control signal drives everything that shows or sounds the wind, so eye and
 * ear agree by construction rather than by tuning. Two bands live here:
 *
 * - **wander** — the wind's slow mind-changing, smooth 2-D value noise;
 * - **gusts** — discrete squalls with a fast attack and a long release, the
 *   asymmetry that keeps a noise bed from reading as flat.
 *
 * Both bands are noise over the *ground*, not over the clock: the field is
 * sampled at a world position and **advected downwind**, so a gust is a cell of
 * air that travels across the level and hits two hedgerows a moment apart
 * instead of shimmering everywhere at once. The cell sizes are chosen against
 * {@link ADVECT_SPEED} so a fixed observer still hears the bands at their old
 * rates — wander at ~0.1 Hz, gusts at ~0.5 Hz.
 *
 * The third band, **flutter**, is deliberately absent: it belongs to each
 * receiver, which hashes its own phase from its entity id so a hedgerow does not
 * shiver in lockstep.
 *
 * Everything is a pure function of position and the ambient clock, so nothing is
 * saved and two consumers sampling the same point at the same `t` get the same
 * answer.
 */

/**
 * World units a gust cell travels downwind each second.
 *
 * Deliberately a constant rather than a function of the wind scalar: the field
 * is displaced by `speed * t`, so a speed that eased with the weather would drag
 * the whole field sideways by hours of accumulated time whenever the wind
 * changed. Direction still steers the travel, and that flip happens exactly
 * where the signed wind passes through zero and nothing is visible anyway.
 */
const ADVECT_SPEED = 120;

/** World units across one wander cell — `120 / 1200` is the old ~0.1 Hz band. */
const WANDER_CELL = 1200;

/** World units across one gust cell — `120 / 240` is the old ~0.5 Hz band. */
const GUST_CELL = 240;

/**
 * How much taller than wide a cell is. A squall front is a roughly vertical wall
 * of moving air, so the field varies far less with height than with distance
 * along the wind.
 */
const ROW_STRETCH = 4;

const WANDER_SALT = 0x571e_d0a3;
const GUST_SALT = 0x2f9b_e611;

/** How much of a gust's cell is spent rising. Small, so gusts hit and then fade. */
const GUST_ATTACK = 0.18;

/** Floor of the wander band, so a windy preset never fully stills. */
const WANDER_FLOOR = 0.6;

/** How far a full gust can push the envelope past the wander band. */
const GUST_DEPTH = 0.8;

/** Share of gust depth that survives even in the calmest wind. */
const GUST_BASE = 0.3;

/**
 * One gust's shape across its cell: a quick smoothstepped rise then a long
 * smoothstepped fall, reaching zero at both ends so consecutive cells join
 * without a step or a corner.
 */
const gustShape = (phase: number): number =>
	phase < GUST_ATTACK
		? smoothstep(phase / GUST_ATTACK)
		: smoothstep(1 - (phase - GUST_ATTACK) / (1 - GUST_ATTACK));

/**
 * The gust band alone, `0..1` — each cell's strength hashed from its lattice
 * point and shaped fast-attack/slow-release along the travel axis.
 *
 * The strength blends between rows so there is no seam where a particle crosses
 * a row boundary; the shape does not, because it already reaches zero at both
 * ends of a cell.
 */
const gustBand = (along: number, row: number): number => {
	const cell = Math.floor(along);
	const lattice = Math.floor(row);
	const near = hashUnit2(cell, lattice, GUST_SALT);
	const far = hashUnit2(cell, lattice + 1, GUST_SALT);
	return (
		(near + (far - near) * smoothstep(row - lattice)) *
		gustShape(along - cell)
	);
};

/**
 * The multiplier a wind scalar rides at a world point: wander plus gusts, where
 * stronger wind gusts harder. Roughly `0.6` in a lull to `1.8` at the peak of a
 * squall in a gale, and never negative — direction is the scalar's business, not
 * the envelope's.
 *
 * `direction` steers the advection only; its sign decides which way the cells
 * travel, so a point downwind meets a gust after the point upwind of it.
 *
 * @example
 * const speed =
 * 	weather.visibleWind *
 * 	windEnvelope(x, y, ambientTime(ecs), weather.visibleWind, weather.direction);
 */
export const windEnvelope = (
	x: number,
	y: number,
	t: Seconds,
	wind: number,
	direction: number,
): number => {
	const along = t * ADVECT_SPEED - (direction < 0 ? -x : x);
	const row = y / ROW_STRETCH;
	const wander =
		WANDER_FLOOR +
		(1 - WANDER_FLOOR) *
			valueNoise2(
				along / WANDER_CELL,
				row / WANDER_CELL,
				WANDER_SALT,
			);
	return (
		wander +
		GUST_DEPTH *
			gustBand(along / GUST_CELL, row / GUST_CELL) *
			gustReach(wind)
	);
};

/**
 * {@link windEnvelope} for a listener that has no position — the ear.
 *
 * The audio mix reads the weather as one global bed rather than per source, so
 * it takes the field at the origin. Same signal, same code path: there is one
 * wind, not an audible one and a visible one.
 *
 * @example
 * const gust = gustEnvelope(frame.time, frame.wind);
 */
export const gustEnvelope = (t: Seconds, wind: number): number =>
	windEnvelope(0, 0, t, wind, 1);

const gustReach = (wind: number): number =>
	GUST_BASE + (1 - GUST_BASE) * clamp01(wind);

/**
 * The largest value {@link windEnvelope} can take at a given wind — wander at
 * full plus a full gust.
 *
 * A consumer that needs the envelope as a `0..1` weight divides by this instead
 * of clamping the product. `clamp01(wind * gust)` saturates at a gale: from
 * roughly `wind > 0.55` upward the product spends most of its time pinned at 1,
 * so a gust can only ever modulate *downward* and a storm's bed dips where it
 * should surge. Normalising keeps the gusting symmetric at full wind, which is
 * the whole point of having an envelope.
 *
 * @example
 * const speed = wind * gustEnvelope(t, wind) / gustEnvelopeCeiling(wind);
 */
export const gustEnvelopeCeiling = (wind: number): number =>
	1 + GUST_DEPTH * gustReach(wind);
