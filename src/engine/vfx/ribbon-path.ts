/**
 * The ribbon **path generator seam**: the one thing that differs between a wind
 * line, a lightning bolt, a loot beam and a helix.
 *
 * A ribbon part is a path plus a width profile, so consolidating them into one
 * part kind leaves exactly this variation point. A generator is a pure function
 * of its authored parameters and a {@link RibbonPathInput} that writes world
 * points into caller-owned arrays; it allocates nothing, knows nothing about
 * pools, entities or rendering, and is called once per live ribbon per frame.
 *
 * **Adding a generator** — the published contract for the workstreams that bring
 * bolts, beams and helices:
 *
 * 1. add its id to {@link VFX_RIBBON_PATHS};
 * 2. add its parameter member to {@link VfxRibbonPath}, discriminated on
 *    `generator`, and parse it in `vfx-def.ts` beside the others;
 * 3. add its `case` to {@link generateRibbonPath}.
 *
 * Step 3 is not optional: the switch is exhaustiveness-checked against the tuple,
 * so an id with no generator is a compile error rather than a ribbon that draws
 * nothing.
 */

import type { Mutable } from "../mutable";

const TAU = Math.PI * 2;

export const VFX_RIBBON_PATHS = [
	"wander",
	"vertical",
	"helix",
] as const;

export type VfxRibbonPathId = (typeof VFX_RIBBON_PATHS)[number];

/**
 * A line that drifts downwind, bowing in and out along its length — the wind
 * line.
 *
 * The wander is two octaves of sine rather than sampled noise: it is smooth by
 * construction, costs two `sin` calls per point, and needs no table. Both
 * octaves creep with the ambient clock, so a line breathes while it lives
 * instead of holding a frozen shape.
 */
export type VfxRibbonWanderPath = Readonly<{
	generator: "wander";
	/** Peak lateral excursion from the base line, world units. */
	amplitude: number;
	/** Wander cycles over the ribbon's whole length. */
	waves: number;
	/** Per-instance random tilt off the wind heading, radians either way. */
	tilt: number;
}>;

/**
 * A column rising from its origin — the loot beam's main shaft.
 *
 * World y points **down**, so the path runs from the origin to `length` above
 * it. Straightness is the point: the only departures are a per-instance lean,
 * drawn off the seed so several strands of one beam do not overlap exactly, and
 * a bow that breathes with the ambient clock. The bow is pinned at both ends by
 * `sin(PI * u)`, so a beam never detaches from the thing it marks.
 */
export type VfxRibbonVerticalPath = Readonly<{
	generator: "vertical";
	/** Lateral offset of the top from the base, world units either way. */
	lean: number;
	/** Peak lateral bow at mid-height, world units. */
	bow: number;
	/** Bow cycles per second, phase-sampled off the ambient clock. */
	sway: number;
}>;

/**
 * A helix winding about a vertical axis — the Epic beam's orbiting strands.
 *
 * The 2D projection of a 3D helix is a sinusoid in `x` against a linear rise in
 * `y`: the orbit's depth component is simply not drawn. That is the whole maths,
 * and it is what makes the shape read as an orbit rather than as noise — the
 * turns are evenly spaced in height and the strand reverses exactly at the
 * radius, where a real orbit passes behind the axis.
 *
 * `spin` rotates the whole helix about its axis over time, so the strand appears
 * to travel around the beam; `turns` sets how many times it wraps over the
 * ribbon's length.
 */
export type VfxRibbonHelixPath = Readonly<{
	generator: "helix";
	/** Orbit radius at the base, world units. */
	radius: number;
	/** Full turns over the ribbon's whole length. */
	turns: number;
	/** Turns per second the helix rotates about its axis. */
	spin: number;
	/** Radius multiplier at the top: `1` is a cylinder, `0` a closing cone. */
	topScale: number;
}>;

/** A validated path generator and its parameters. */
export type VfxRibbonPath =
	| VfxRibbonWanderPath
	| VfxRibbonVerticalPath
	| VfxRibbonHelixPath;

/** Everything a generator knows about the ribbon it is drawing this frame. */
export type RibbonPathInput = Readonly<{
	/** Path origin, in the ribbon's own space — world, or host-relative. */
	x: number;
	y: number;
	/** Total path length in world units, drawn from the part's range at birth. */
	length: number;
	/** Normalized age, `0..1`. */
	age: number;
	/** A draw in `[0, 1)`, fixed for this ribbon's whole life. */
	seed: number;
	/** Signed wind, as `sampleWind` returns it: negative blows left. */
	wind: number;
	/** Ambient seconds, so generators stay phase-coherent with everything else. */
	time: number;
	/** How many points to write, always `segments + 1` and at least two. */
	points: number;
}>;

/**
 * A {@link RibbonPathInput} the caller refills per ribbon. Generators only read
 * it, so one instance can be rewritten for a whole band instead of building a
 * fresh input per ribbon per frame.
 */
export type MutableRibbonPathInput = Mutable<RibbonPathInput>;

/**
 * Write a ribbon's world points into `px`/`py`.
 *
 * Parallel arrays rather than points: `drawRibbon` speaks them, and a `Vector2`
 * per point per frame would allocate through the whole ribbon path.
 *
 * @example
 * generateRibbonPath(part.path, input, this.pathX, this.pathY);
 * drawRibbon(renderer, layer, { px: this.pathX, py: this.pathY, profile, blend });
 */
export const generateRibbonPath = (
	path: VfxRibbonPath,
	input: RibbonPathInput,
	px: number[],
	py: number[],
): void => {
	const generator = path.generator;
	switch (generator) {
		case "wander":
			wanderPath(path, input, px, py);
			return;
		case "vertical":
			verticalPath(path, input, px, py);
			return;
		case "helix":
			helixPath(path, input, px, py);
			return;
	}
	const unhandled: never = generator;
	throw new Error(
		`ribbon path generator "${String(unhandled)}" has no implementation.`,
	);
};

const fract = (value: number): number => value - Math.floor(value);

const wanderPath = (
	path: VfxRibbonWanderPath,
	input: RibbonPathInput,
	px: number[],
	py: number[],
): void => {
	const heading = input.wind < 0 ? -1 : 1;
	const tilt = path.tilt * (fract(input.seed * 3.71) * 2 - 1);
	const alongX = Math.cos(tilt) * heading;
	const alongY = Math.sin(tilt);
	const phaseA = input.seed * TAU + input.time * 0.7;
	const phaseB = fract(input.seed * 7.13) * TAU - input.time * 0.43;
	const last = input.points - 1;
	for (let i = 0; i <= last; i++) {
		const u = i / last;
		const lateral =
			path.amplitude *
			(0.62 * Math.sin(TAU * path.waves * u + phaseA) +
				0.38 * Math.sin(TAU * path.waves * 1.7 * u + phaseB));
		const travel = u * input.length;
		px[i] = input.x + alongX * travel - alongY * lateral;
		py[i] = input.y + alongY * travel + alongX * lateral;
	}
};

/** A seeded draw in `[-1, 1]`, decorrelated from the seed's other uses. */
const signed = (seed: number, salt: number): number =>
	fract(seed * salt) * 2 - 1;

const verticalPath = (
	path: VfxRibbonVerticalPath,
	input: RibbonPathInput,
	px: number[],
	py: number[],
): void => {
	const lean = path.lean * signed(input.seed, 5.17);
	const bow =
		path.bow *
		Math.sin(TAU * path.sway * input.time + input.seed * TAU);
	const last = input.points - 1;
	for (let i = 0; i <= last; i++) {
		const u = i / last;
		px[i] = input.x + lean * u + bow * Math.sin(Math.PI * u);
		py[i] = input.y - u * input.length;
	}
};

const helixPath = (
	path: VfxRibbonHelixPath,
	input: RibbonPathInput,
	px: number[],
	py: number[],
): void => {
	const phase = input.seed * TAU + input.time * path.spin * TAU;
	const last = input.points - 1;
	for (let i = 0; i <= last; i++) {
		const u = i / last;
		const radius = path.radius * (1 + (path.topScale - 1) * u);
		px[i] = input.x + Math.cos(TAU * path.turns * u + phase) * radius;
		py[i] = input.y - u * input.length;
	}
};
