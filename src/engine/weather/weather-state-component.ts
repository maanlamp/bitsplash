import {
	serializable,
	serialize,
} from "../serialization/serializable";

/**
 * The one global weather run-state, carried by a `PersistentComponent`-tagged
 * entity the scheduler lazily self-ensures.
 *
 * Global rather than per-scene so an indoor detour can keep the outdoor storm
 * ticking without any scene-relation machinery: the `PersistentComponent`
 * partition already survives scene changes for free.
 *
 * Serialized whole, which is what makes capture → restore → continue exact. The
 * eased scalars *are* the transition envelope, so a load in the middle of a
 * squall resumes mid-ease rather than snapping; and because {@link climateId}
 * records the climate the current preset was rolled for, a restore into the same
 * scene reconciles to nothing and causes no spurious reroll.
 *
 * There is exactly one of these per world. The scheduler adopts a single existing
 * instance (the restore path) and crashes loudly on a second — two weather states
 * would mean two authorities over one global mood.
 */
@serializable("WeatherState")
export class WeatherStateComponent {
	/**
	 * Resolved id of the climate the current preset was rolled for. Empty means
	 * never seeded, which is the scheduler's first-ever-ensure signal. A scene
	 * whose resolved climate differs from this reconciles with one fresh weighted
	 * roll — the single reconcile rule.
	 */
	@serialize() climateId = "";

	/** Id of the preset currently being chased. Empty only before the first seed. */
	@serialize() presetId = "";

	/** Eased wind strength, `0..1`. Chases the effective wind target. */
	@serialize() wind = 0;

	/** Eased precipitation, `0..1`. Chases the effective precipitation target. */
	@serialize() precipitation = 0;

	/** Eased signed horizontal base direction, `-1..1`. */
	@serialize() direction = 1;

	/** Seconds left before the next weighted preset roll. */
	@serialize() dwellRemaining = 0;

	/**
	 * The scheduler's PRNG position — one `uint32`, stepped with `rngNext`. The
	 * first serialized generator state in the project: preset picks and dwell
	 * lengths must land identically after a load or a save is a different game.
	 */
	@serialize() rng = 0;
}
