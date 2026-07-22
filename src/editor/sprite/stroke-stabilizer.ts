import type { Cell } from "./shapes";

/** The maximum catch-up steps {@link StrokeStabilizer.flush} will ease before snapping. */
const MAX_FLUSH_STEPS = 1024;

/**
 * Map a stabilizer amount to a lazy-follow weight in `[0, 0.95]`.
 *
 * `0` (and anything below) means "no smoothing" — a weight of `0` makes the
 * smoothed point jump straight to the input, reproducing the raw stroke exactly.
 * Higher amounts approach (but never reach) `1`, where the point would never
 * catch up. The amount is treated as a percentage: `100` maps near the cap.
 *
 * @example
 * stabilizerWeight(0);   // 0    (raw stroke)
 * stabilizerWeight(50);  // 0.5
 * stabilizerWeight(999); // 0.95 (capped)
 */
export const stabilizerWeight = (amount: number): number =>
	amount <= 0 ? 0 : Math.min(0.95, amount / 100);

/**
 * A "pulled string" stroke stabilizer: it holds a smoothed position that chases
 * the raw pointer, moving a fraction `(1 - weight)` of the remaining distance per
 * input sample. A higher weight lags further behind, so the drawn line is
 * smoother and laggier; a weight of `0` tracks the pointer exactly.
 *
 * The class is pure (no DOM, no document) and stateful for a single stroke:
 * {@link begin} seeds it at the press point, {@link push} advances one step per
 * pointer move returning the smoothed integer cell to draw toward, and
 * {@link flush} eases the smoothed point the rest of the way to the true release
 * point so the line reaches where the pointer actually ended. The caller
 * Bresenham-interpolates between the previous smoothed cell and each returned
 * cell to keep the stamped stream gap-free.
 *
 * @example
 * const s = new StrokeStabilizer(50);
 * s.begin(0, 0);      // [0, 0]
 * s.push(10, 0);      // [5, 0]   (halfway, weight 0.5)
 * s.push(10, 0);      // [8, 0]   (chasing)
 * s.flush(10, 0);     // [..., [10, 0]] (eases to the true end)
 */
export class StrokeStabilizer {
	private x = 0;
	private y = 0;
	private readonly weight: number;

	constructor(amount: number) {
		this.weight = stabilizerWeight(amount);
	}

	/** Seed the smoothed position at the press point; returns the start cell. */
	begin(x: number, y: number): Cell {
		this.x = x;
		this.y = y;
		return [Math.round(x), Math.round(y)];
	}

	/** Advance one lazy-follow step toward `(x, y)`; returns the smoothed cell. */
	push(x: number, y: number): Cell {
		const follow = 1 - this.weight;
		this.x += (x - this.x) * follow;
		this.y += (y - this.y) * follow;
		return [Math.round(this.x), Math.round(this.y)];
	}

	/**
	 * Ease the smoothed position the rest of the way to the true release point
	 * `(x, y)` and snap exactly onto it, returning every smoothed cell passed
	 * through (the last is always `[round(x), round(y)]`). Bounded: after
	 * {@link MAX_FLUSH_STEPS} eased steps it snaps directly, so a near-`1` weight
	 * still terminates.
	 */
	flush(x: number, y: number): ReadonlyArray<Cell> {
		const follow = 1 - this.weight;
		const cells: Cell[] = [];
		for (let step = 0; step < MAX_FLUSH_STEPS; step++) {
			if (Math.hypot(x - this.x, y - this.y) < 0.5) {
				break;
			}
			this.x += (x - this.x) * follow;
			this.y += (y - this.y) * follow;
			cells.push([Math.round(this.x), Math.round(this.y)]);
		}
		this.x = x;
		this.y = y;
		cells.push([Math.round(x), Math.round(y)]);
		return cells;
	}
}
