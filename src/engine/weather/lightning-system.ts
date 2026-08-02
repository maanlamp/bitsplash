import type { ReadonlyECS } from "../ecs";
import { profiler } from "../profiling/profiler";
import { randomRngSeed, rngNext } from "../rng";
import { FLASH_ENVELOPE } from "../settings/flash-envelope";
import { type UpdateContext, UpdateSystem } from "../system";
import { TILE_SIZE } from "../tilemap/tile";
import { hasClimates, resolvePreset } from "./climate-registry";
import { precipitationHeightAt } from "./exposure";
import { type Bolt, generateBolt } from "./lightning";
import { LightningStrikeEvent } from "./lightning-strike-event";
import { weatherFrame } from "./weather-frame";
import { listenerAt, metres } from "../listener";

/**
 * The strike scheduler: how often lightning strikes, where, and what a strike
 * publishes.
 *
 * **All of its state is a module `WeakMap` keyed by the ECS**, exactly like the
 * ambient clock and for exactly the same reason. This system runs in the
 * editor's live edit world, whose save path diffs a journal replay against that
 * world serialized whole and hard-crashes on drift, so a strike may not be an
 * entity, may not be a component, and may not touch a `@serialize`d field. A
 * strike is an event plus some numbers in a map, and nothing else.
 *
 * The rate is the active preset's authored `lightning`, in strikes per minute —
 * its own field rather than a function of the `rain` channel, because a dry
 * thunderstorm and a rain shower with no lightning are both real weather.
 * Intervals are drawn from an exponential distribution, so strikes arrive in the
 * clumps a storm actually produces rather than on a metronome.
 *
 * **The photosensitivity cap lives here**, not in the flash: at most
 * {@link FLASH_ENVELOPE.maxPerSecond} strikes are published in any one second
 * and the rest are dropped outright. Thinning at the scheduler is what makes a
 * high authored rate produce *fewer, unstacked* strikes instead of a stack of
 * overlapping flashes — and it caps thunder along with the flash, which stacking
 * at the consumer would not.
 *
 * A strike lands on the top of the terrain in its column
 * ({@link precipitationHeightAt}), so bolts only reach columns the sky reaches.
 * A column open to the sky all the way down has nothing to hit, so a strike
 * searches outward for one that does; only when nothing within reach has ground
 * does it stay a bolt beyond the frame, lighting the sky and thundering while
 * drawing nothing.
 */

/** How long a bolt stays on screen. */
export const BOLT_SECONDS = 0.22;

/** How high above its impact point a bolt enters the frame, in tiles. */
const BOLT_HEIGHT_TILES = 28;

/** How far the sky end of a bolt may lean off its impact column, in tiles. */
const BOLT_LEAN_TILES = 6;

/** Half-width of the band distant strikes are drawn from, in metres. */
const STRIKE_SPREAD_METRES = 3500;

/**
 * Half-width of the band a **near** strike is drawn from, in metres.
 *
 * Sized to the frame rather than to the storm: a viewport is roughly twenty
 * metres across at the usual zoom, so this puts a near strike in or just beside
 * the visible column.
 */
const NEAR_SPREAD_METRES = 18;

/**
 * Share of strikes placed in the near band.
 *
 * Without this, position was one `spread²` draw across the full 3.5 km, which
 * put only ~5% of strikes inside the frame — at a storm's nine strikes a minute
 * that is one visible bolt every two minutes, so lightning read as broken. The
 * far tail still exists and still carries the distance banding thunder was built
 * around; it just no longer swallows every strike.
 */
const NEAR_STRIKE_SHARE = 0.55;

/** Beyond this distance a strike is audible only, and no geometry is built. */
const BOLT_DRAW_DISTANCE = metres(120);

/**
 * How far either side of its drawn column a strike will look for ground, in
 * tiles. Wide enough to cross a pit or reach back inside a level's edge,
 * narrow enough that the bolt stays at the distance the scheduler chose.
 */
const GROUND_SEARCH_TILES = 24;

/** Weakest a strike can be. Nothing published is a token flicker. */
const MIN_INTENSITY = 0.55;

/** A strike the renderer may still be drawing. */
export type LiveStrike = {
	readonly event: LightningStrikeEvent;
	/** Geometry, or `null` for a strike too far away to draw. */
	readonly bolt: Bolt | null;
	/** Seconds since the strike. */
	age: number;
};

type LightningState = {
	rng: number;
	/** Seconds until the next strike, or `null` when nothing is scheduled. */
	nextIn: number | null;
	/** Ambient times of the strikes let through in the last second. */
	recent: number[];
	strikes: LiveStrike[];
};

const NO_STRIKES: readonly LiveStrike[] = [];

const states = new WeakMap<ReadonlyECS, LightningState>();

const stateOf = (ecs: ReadonlyECS): LightningState => {
	const existing = states.get(ecs);
	if (existing) {
		return existing;
	}
	const fresh: LightningState = {
		rng: randomRngSeed(),
		nextIn: null,
		recent: [],
		strikes: [],
	};
	states.set(ecs, fresh);
	return fresh;
};

/**
 * Strikes still on screen in this world, newest last. Empty in a world the
 * scheduler has never run in.
 */
export const activeStrikes = (
	ecs: ReadonlyECS,
): readonly LiveStrike[] => states.get(ecs)?.strikes ?? NO_STRIKES;

/** Strikes per second the active preset asks for; zero when weather is off. */
const strikeRate = (ecs: ReadonlyECS): number => {
	if (!hasClimates()) {
		return 0;
	}
	const frame = weatherFrame(ecs);
	if (frame.indoor || frame.presetId === null) {
		return 0;
	}
	return resolvePreset(frame.presetId).lightning / 60;
};

@profiler("Lightning", "Weather")
export class LightningSystem implements UpdateSystem {
	update(ctx: UpdateContext): void {
		const { ecs, time } = ctx;
		const dt = time.dt;
		const state = stateOf(ecs);
		this.expire(state, dt);

		const rate = strikeRate(ecs);
		if (rate <= 0) {
			state.nextIn = null;
			return;
		}
		if (state.nextIn === null) {
			state.nextIn = this.interval(state, rate);
		}
		state.nextIn -= dt;
		let fired = 0;
		while (state.nextIn <= 0 && fired < FLASH_ENVELOPE.maxPerSecond) {
			this.strike(ctx, state);
			state.nextIn += this.interval(state, rate);
			fired++;
		}
		if (state.nextIn <= 0) {
			state.nextIn = this.interval(state, rate);
		}
	}

	/** Age out finished bolts and the flash-cap window. */
	private expire(state: LightningState, dt: number): void {
		for (let i = state.strikes.length - 1; i >= 0; i--) {
			const strike = state.strikes[i]!;
			strike.age += dt;
			if (strike.age > BOLT_SECONDS) {
				state.strikes.splice(i, 1);
			}
		}
	}

	/**
	 * Seconds to the next strike, drawn from an exponential distribution so the
	 * mean is `1 / rate` and the spacing is clumpy rather than regular.
	 */
	private interval(state: LightningState, rate: number): number {
		const draw = this.random(state);
		return -Math.log(1 - draw) / rate;
	}

	private random(state: LightningState): number {
		const [value, next] = rngNext(state.rng);
		state.rng = next;
		return value;
	}

	/**
	 * The nearest tile column to `wanted` that a bolt can actually hit, or `null`
	 * when nothing within reach has ground under the sky.
	 *
	 * `precipitationHeightAt` answers `null` for a column open to the sky all the
	 * way down — a pit, or anywhere past the level's edge. A strike drawn into
	 * such a column used to publish its event and then draw no geometry at all, so
	 * the flash fired and thundered over an empty sky. Searching outward keeps the
	 * scheduler's chosen distance while landing the bolt on real terrain, which is
	 * what "bolts only land in sky-reached columns" was meant to mean.
	 */
	private groundedColumn(
		ecs: ReadonlyECS,
		wanted: number,
		listener: Readonly<{ listenerX: number; listenerY: number }>,
	): Readonly<{ x: number; roof: number }> | null {
		const origin = Math.floor(wanted / TILE_SIZE);
		for (let step = 0; step <= GROUND_SEARCH_TILES; step++) {
			for (const gx of step === 0
				? [origin]
				: [origin - step, origin + step]) {
				const roof = precipitationHeightAt(
					ecs,
					gx,
					listener.listenerX,
					listener.listenerY,
				);
				if (roof !== null) {
					return {
						x: step === 0 ? wanted : gx * TILE_SIZE,
						roof,
					};
				}
			}
		}
		return null;
	}

	private strike(ctx: UpdateContext, state: LightningState): void {
		const { ecs, events } = ctx;
		const now = weatherFrame(ecs).time;
		state.recent = state.recent.filter((at) => now - at < 1);
		if (state.recent.length >= FLASH_ENVELOPE.maxPerSecond) {
			return;
		}

		const { x: listenerX, y: listenerY } = listenerAt(
			ecs,
			ctx.camera,
		);

		const near = this.random(state) < NEAR_STRIKE_SHARE;
		const spread = this.random(state);
		const side = this.random(state) < 0.5 ? -1 : 1;
		const offset =
			side *
			(near
				? metres(NEAR_SPREAD_METRES) * spread
				: metres(STRIKE_SPREAD_METRES) * spread * spread);
		const wanted = listenerX + offset;
		const grounded = this.groundedColumn(ecs, wanted, {
			listenerX,
			listenerY,
		});
		const x = grounded?.x ?? wanted;
		const roof = grounded?.roof ?? null;
		const y = roof === null ? listenerY : roof * TILE_SIZE;
		const skyY = y - BOLT_HEIGHT_TILES * TILE_SIZE;
		const skyX =
			x + (this.random(state) * 2 - 1) * BOLT_LEAN_TILES * TILE_SIZE;
		const intensity =
			MIN_INTENSITY + (1 - MIN_INTENSITY) * this.random(state);
		const seed = (this.random(state) * 0x1_0000_0000) >>> 0;

		const event = new LightningStrikeEvent(
			x,
			y,
			skyX,
			skyY,
			intensity,
			seed,
			now,
		);
		const drawable =
			roof !== null && Math.abs(offset) <= BOLT_DRAW_DISTANCE;
		state.strikes.push({
			event,
			bolt: drawable ? generateBolt(seed, skyX, skyY, x, y) : null,
			age: 0,
		});
		state.recent.push(now);
		events.emit(event);
	}
}
