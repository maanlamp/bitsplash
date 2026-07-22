/** An integer stroke cell. */
export type Cell = readonly [number, number];

/**
 * The Aseprite "pixel-perfect" stroke post-processor: as freehand cells stream
 * in, it drops the redundant corner pixel of every 3-cell L-bend so diagonal
 * lines stay a clean single pixel wide instead of showing a stair-step "double
 * pixel" at each turn.
 *
 * A cell `b` is redundant when it sits between an already-emitted cell `a` and
 * an incoming cell `c` such that `a`–`b` and `b`–`c` are each orthogonally
 * adjacent (share a row or column) while `a` and `c` are diagonal (differ on
 * both axes): the corner `b` can be removed and `a`→`c` still connects with a
 * single diagonal step.
 *
 * The filter is stateful for one stroke and emits lazily: a cell is only handed
 * back once the *next* cell proves it is not a removable corner, so a corner is
 * never stamped and then un-stamped. {@link flush} emits the final held cell on
 * stroke end. Feed it the interpolated (gap-free) cell stream — consecutive
 * inputs must be adjacent, which the caller's Bresenham interpolation
 * guarantees.
 *
 * @example
 * const pp = new PixelPerfectFilter();
 * pp.push(0, 0);      // []      (held)
 * pp.push(1, 0);      // [[0,0]] (0,0 confirmed)
 * pp.push(1, 1);      // []      ((1,0) is a corner candidate)
 * pp.push(2, 1);      // []      ((1,0) dropped; (1,1) held)
 * pp.flush();         // [[1,1]]
 */
export class PixelPerfectFilter {
	private a: Cell | null = null;
	private b: Cell | null = null;

	/** Feed one stroke cell; returns the cells (0 or 1) now safe to stamp. */
	push(x: number, y: number): ReadonlyArray<Cell> {
		if (this.b === null) {
			this.b = [x, y];
			return [];
		}
		if (this.b[0] === x && this.b[1] === y) {
			return [];
		}
		const a = this.a;
		const b = this.b;
		if (a && this.isCorner(a, b, [x, y])) {
			this.b = [x, y];
			return [];
		}
		this.a = b;
		this.b = [x, y];
		return [b];
	}

	/** Emit the final held cell (never a removable corner) at stroke end. */
	flush(): ReadonlyArray<Cell> {
		if (this.b === null) {
			return [];
		}
		const b = this.b;
		this.a = b;
		this.b = null;
		return [b];
	}

	private isCorner(a: Cell, b: Cell, c: Cell): boolean {
		return (
			(a[0] === b[0] || a[1] === b[1]) &&
			(b[0] === c[0] || b[1] === c[1]) &&
			a[0] !== c[0] &&
			a[1] !== c[1]
		);
	}
}
