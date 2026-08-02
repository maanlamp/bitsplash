import type { Seconds } from "../duration";
import { clamp01, hashUnit, smoothstep, valueNoise1 } from "../noise";

/**
 * The shared gust signal — Farnell's wind decomposition, stateless.
 *
 * One control signal drives everything that shows or sounds the wind, so eye and
 * ear agree by construction rather than by tuning. Two bands live here:
 *
 * - **wander** (~0.1 Hz) — the wind's slow mind-changing, smooth value noise;
 * - **gusts** (~0.5 Hz) — discrete squalls with a fast attack and a long release,
 *   the asymmetry that keeps a noise bed from reading as flat.
 *
 * The third band, **flutter**, is deliberately absent: it belongs to each
 * receiver, which hashes its own phase from its entity id so a hedgerow does not
 * shiver in lockstep.
 *
 * Everything is a pure function of the ambient clock, so nothing is saved and
 * every consumer sampling the same `t` gets the same answer.
 */

const WANDER_HZ = 0.1;
const GUST_HZ = 0.5;
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
 * The gust band alone, `0..1` — each cell's strength hashed from its index and
 * shaped fast-attack/slow-release.
 */
const gustBand = (t: Seconds): number => {
	const cellT = t * GUST_HZ;
	const cell = Math.floor(cellT);
	return hashUnit(cell, GUST_SALT) * gustShape(cellT - cell);
};

/**
 * The multiplier a wind scalar rides: wander plus gusts, where stronger wind
 * gusts harder. Roughly `0.6` in a lull to `1.8` at the peak of a squall in a
 * gale, and never negative — direction is the scalar's business, not the
 * envelope's.
 *
 * @example
 * const speed = weather.visibleWind * gustEnvelope(ambientTime(ecs), weather.visibleWind);
 */
export const gustEnvelope = (t: Seconds, wind: number): number => {
	const wander =
		WANDER_FLOOR +
		(1 - WANDER_FLOOR) * valueNoise1(t * WANDER_HZ, WANDER_SALT);
	return wander + GUST_DEPTH * gustBand(t) * gustReach(wind);
};

const gustReach = (wind: number): number =>
	GUST_BASE + (1 - GUST_BASE) * clamp01(wind);

/**
 * The largest value {@link gustEnvelope} can take at a given wind — wander at
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
