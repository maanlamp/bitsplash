import { rngNext } from "../rng";

/**
 * Bolt geometry by midpoint displacement: pure, seeded, and reproducible from a
 * strike event alone.
 *
 * A bolt is generated once, when the strike is scheduled, and held for the few
 * frames it is on screen — so unlike a ribbon path generator this allocates, and
 * is not called per frame. What matters instead is that it is a **function**:
 * the same seed and the same endpoints give the same bolt in any world, on any
 * frame, in a test. That is what makes `LightningStrikeEvent` a complete
 * description of a strike rather than a notification that one happened, and it
 * is why nothing here reads a clock, a setting or a module variable.
 *
 * The shape is the classic one: subdivide the segment, push the new midpoint
 * along the segment normal, halve the push each generation. Forks are drawn at
 * subdivision points of the trunk and are shorter and dimmer than their parent,
 * each carrying its own intensity so the renderer can dim it.
 *
 * @example
 * const bolt = generateBolt(e.seed, e.skyX, e.skyY, e.x, e.y);
 * for (const strand of bolt.strands) drawRibbon(renderer, layer, …);
 */

/** How jagged a bolt is, how often it forks, and how far a fork runs. */
type BoltShape = Readonly<{
	/** Subdivision passes. Points are `2^generations + 1`. */
	generations: number;
	/** First midpoint offset, as a fraction of the bolt's straight length. */
	roughness: number;
	/** Chance a trunk subdivision point sprouts a fork. */
	forkChance: number;
	/** Fork length, as a fraction of the trunk left below the fork point. */
	forkLength: number;
	/** Fork brightness relative to its trunk. */
	forkDim: number;
	/** Ceiling on forks per bolt, so a high chance cannot explode the strand count. */
	maxForks: number;
}>;

/** The shape the weather's own strikes use. */
const DEFAULT_BOLT_SHAPE: BoltShape = {
	generations: 5,
	roughness: 0.14,
	forkChance: 0.16,
	forkLength: 0.45,
	forkDim: 0.55,
	maxForks: 3,
};

/** One drawable line of a bolt: the trunk, or one fork. */
export type BoltStrand = Readonly<{
	/** X of each point, sky end first. */
	x: readonly number[];
	/** Y of each point, sky end first. */
	y: readonly number[];
	/** Brightness relative to the trunk, `0..1`. */
	intensity: number;
}>;

/** A whole bolt: the trunk followed by its forks, in generation order. */
export type Bolt = Readonly<{
	strands: readonly BoltStrand[];
}>;

const FORK_MIN_ANGLE = 0.35;
const FORK_MAX_ANGLE = 0.9;

/**
 * Midpoint-displace the open segment `[x0,y0] -> [x1,y1]` into `x`/`y`,
 * returning the advanced generator state.
 */
const displace = (
	rng: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	generations: number,
	offset: number,
	x: number[],
	y: number[],
): number => {
	x.length = 0;
	y.length = 0;
	x.push(x0, x1);
	y.push(y0, y1);
	let state = rng;
	let push = offset;
	for (let g = 0; g < generations; g++) {
		for (let i = x.length - 1; i > 0; i--) {
			const ax = x[i - 1]!;
			const ay = y[i - 1]!;
			const bx = x[i]!;
			const by = y[i]!;
			const dx = bx - ax;
			const dy = by - ay;
			const len = Math.hypot(dx, dy);
			const [draw, next] = rngNext(state);
			state = next;
			const lateral = (draw * 2 - 1) * push;
			const nx = len === 0 ? 0 : -(dy / len) * lateral;
			const ny = len === 0 ? 0 : (dx / len) * lateral;
			x.splice(i, 0, (ax + bx) / 2 + nx);
			y.splice(i, 0, (ay + by) / 2 + ny);
		}
		push /= 2;
	}
	return state;
};

const strandOf = (
	x: readonly number[],
	y: readonly number[],
	intensity: number,
): BoltStrand => ({ x: [...x], y: [...y], intensity });

/**
 * Build the bolt a strike draws, from the strike's own seed.
 *
 * Endpoints are world units with y pointing down, so the sky end comes first
 * and the impact point last.
 *
 * @param seed The strike's seed. The same seed always yields the same bolt.
 */
export const generateBolt = (
	seed: number,
	skyX: number,
	skyY: number,
	groundX: number,
	groundY: number,
	shape: BoltShape = DEFAULT_BOLT_SHAPE,
): Bolt => {
	const span = Math.hypot(groundX - skyX, groundY - skyY);
	const scratchX: number[] = [];
	const scratchY: number[] = [];
	let rng = displace(
		seed,
		skyX,
		skyY,
		groundX,
		groundY,
		shape.generations,
		span * shape.roughness,
		scratchX,
		scratchY,
	);
	const trunkX = [...scratchX];
	const trunkY = [...scratchY];
	const strands: BoltStrand[] = [strandOf(trunkX, trunkY, 1)];

	const last = trunkX.length - 1;
	let forks = 0;
	for (let i = 1; i < last && forks < shape.maxForks; i++) {
		const [roll, afterRoll] = rngNext(rng);
		rng = afterRoll;
		if (roll >= shape.forkChance) {
			continue;
		}
		const remainingX = trunkX[last]! - trunkX[i]!;
		const remainingY = trunkY[last]! - trunkY[i]!;
		const remaining = Math.hypot(remainingX, remainingY);
		if (remaining === 0) {
			continue;
		}
		const [side, afterSide] = rngNext(rng);
		rng = afterSide;
		const [spread, afterSpread] = rngNext(rng);
		rng = afterSpread;
		const angle =
			(side < 0.5 ? -1 : 1) *
			(FORK_MIN_ANGLE + spread * (FORK_MAX_ANGLE - FORK_MIN_ANGLE));
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const reach = remaining * shape.forkLength;
		const tipX =
			trunkX[i]! +
			((remainingX * cos - remainingY * sin) / remaining) * reach;
		const tipY =
			trunkY[i]! +
			((remainingX * sin + remainingY * cos) / remaining) * reach;
		rng = displace(
			rng,
			trunkX[i]!,
			trunkY[i]!,
			tipX,
			tipY,
			Math.max(1, shape.generations - 2),
			reach * shape.roughness,
			scratchX,
			scratchY,
		);
		strands.push(strandOf(scratchX, scratchY, shape.forkDim));
		forks++;
	}
	return { strands };
};
