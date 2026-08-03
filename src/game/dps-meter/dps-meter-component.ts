import { Timeline } from "../../engine/animation/timeline";
import { serializable } from "../../engine/serialization/serializable";

/**
 * Hits held in the rolling window. The buffer is a ring: a 65th hit inside one
 * window overwrites the oldest, which is the right failure mode for a readout.
 */
export const DPS_SAMPLE_CAPACITY = 64;

/**
 * A damage-per-second readout floating above an entity: an authored marker plus
 * the rolling tally `DpsMeterSystem` keeps in it.
 *
 * Authored as an empty component — none of the run state is `@serialize`d, so
 * the meter persists as `"DpsMeter": {}` and a snapshot never carries a
 * half-finished combo. The samples live in two preallocated parallel arrays so
 * recording a hit and summing the window allocate nothing.
 *
 * @example
 * // Authored beside Health on a target dummy that must not die.
 * "Health": { "hp": 100, "maxHp": 100 }, "DpsMeter": {}
 */
@serializable("DpsMeter")
export class DpsMeterComponent {
	/** Seconds the meter has been alive; the time base samples are stamped in. */
	clock = 0;

	/** Sample timestamps on {@link clock}, oldest-to-newest around {@link head}. */
	readonly at = new Float64Array(DPS_SAMPLE_CAPACITY);

	/** Damage of each sample, parallel to {@link at}. */
	readonly amount = new Float64Array(DPS_SAMPLE_CAPACITY);

	/** Index the next sample is written to. */
	head = 0;

	/** Samples currently inside the window. */
	count = 0;

	/**
	 * Time since the last hit, run as a countdown: restarted on every hit, and
	 * the tally clears once it is `done()`. Its tail is also the fade the HUD
	 * reads, so the number dims out instead of snapping to zero.
	 */
	readonly idle = new Timeline();

	/** Damage per second over the window, frozen when the hits stop. */
	rate = 0;

	/** Painted form of {@link rate}, rebuilt only when the rate changes. */
	text = "";
}
