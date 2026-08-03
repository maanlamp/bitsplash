import type { Seconds } from "../duration";
import type { ReadonlyECS } from "../ecs";
import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";

/**
 * Accumulated seconds per world, the shared time base for every stateless
 * ambient signal: wind gusts, foliage sway, and (once it lands) VFX.
 *
 * It is a module `WeakMap` keyed by the ECS rather than a component on purpose.
 * Ambient systems run in the editor's live edit world, where `SceneDocument.save`
 * diffs a journal replay against that world serialized whole and hard-crashes on
 * any drift — so ambient state must be structurally invisible to serialization,
 * not merely excluded from it.
 *
 * **Not the engine `Clock`.** `Clock.advance` runs unconditionally even while a
 * host is paused, so `time.elapsed` jumps on resume. This clock only moves when a
 * system ticks it, and a paused host ticks nothing, so the ambience freezes and
 * resumes where it left off.
 *
 * **Deliberately non-restorable.** It is not captured and not restored; a load
 * resumes the eased weather scalars exactly while the gust phase jumps. That is
 * an accepted trade for keeping every ambient signal stateless.
 */
const clocks = new WeakMap<ReadonlyECS, number>();

/**
 * Ambient seconds for a world. Zero in a world whose composition never included
 * {@link AmbientClockSystem} — a still world, not a broken one.
 *
 * @example
 * const bend = sampleWind(ecs, position.x, position.y, ambientTime(ecs));
 */
export const ambientTime = (ecs: ReadonlyECS): Seconds =>
	(clocks.get(ecs) ?? 0) as Seconds;

/**
 * Advance a world's ambient clock. Exposed for tests and hosts that step time
 * without the system; normal worlds get this from {@link AmbientClockSystem}.
 */
export const advanceAmbientClock = (
	ecs: ReadonlyECS,
	dt: number,
): void => {
	clocks.set(ecs, (clocks.get(ecs) ?? 0) + dt);
};

/**
 * Ticks a world's ambient clock, first in `ambientSystems()` so everything
 * downstream in the same frame reads the same time.
 */
@profiler("Ambient clock", "Weather")
export class AmbientClockSystem implements UpdateSystem {
	update({ ecs, time }: UpdateContext): void {
		advanceAmbientClock(ecs, time.dt);
	}
}
