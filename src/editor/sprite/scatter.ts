import type { CellOffset } from "./brush-dab";

/** A source of uniform randoms in `[0, 1)` — `Math.random` in production, a seeded stub in tests. */
export type Rng = () => number;

/**
 * `count` random dab offsets uniformly distributed over the disk of the given
 * `radius`, centred on the stamp cell. Uses the `sqrt(u)` radial transform so the
 * spread is area-uniform (not clustered at the centre). Offsets are integer cells
 * and every one satisfies `hypot(dx, dy) <= radius` (before rounding).
 *
 * Randomness is injected so the distribution can be unit tested against bounds
 * with a deterministic {@link Rng}; production passes `Math.random`, which is
 * fine here — the scatter brush is a creative editor tool, not serialized state.
 */
export const scatterOffsets = (
	rng: Rng,
	count: number,
	radius: number,
): ReadonlyArray<CellOffset> => {
	const out: CellOffset[] = [];
	for (let i = 0; i < count; i++) {
		const angle = rng() * Math.PI * 2;
		const r = Math.sqrt(rng()) * radius;
		out.push([
			Math.round(Math.cos(angle) * r),
			Math.round(Math.sin(angle) * r),
		]);
	}
	return out;
};

/**
 * A per-dab jittered brush size: a random reduction of `baseSize` by up to
 * `jitter` (0–1) of its value, floored at a single pixel. `jitter = 0` returns
 * the base size unchanged; `jitter = 1` can shrink to a single pixel.
 *
 * @example
 * jitterSize(() => 0, 8, 1);   // 8  (no reduction)
 * jitterSize(() => 1, 8, 0.5); // 4  (halved)
 */
export const jitterSize = (
	rng: Rng,
	baseSize: number,
	jitter: number,
): number => Math.max(1, Math.round(baseSize * (1 - rng() * jitter)));
