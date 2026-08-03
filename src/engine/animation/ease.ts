import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

/**
 * Control-point pair that makes the curve's x axis run at uniform speed
 * (`x(t) = t`), which is what lets a preset reproduce a closed-form easing
 * exactly: with x linear in t, the y polynomial *is* the easing function.
 */
const UNIFORM_X1 = 1 / 3;
const UNIFORM_X2 = 2 / 3;

const BACK = 1.70158;

const TABLE_SAMPLES = 17;
const SOLVE_ITERATIONS = 24;
const SOLVE_EPSILON = 1e-10;

type Table = Readonly<{
	x1: number;
	x2: number;
	xs: Float64Array;
}>;

const tables = new WeakMap<Ease, Table>();

const axis = (t: number, p1: number, p2: number): number => {
	const c = 3 * p1;
	const b = 3 * p2 - 6 * p1;
	const a = 1 - 3 * p2 + 3 * p1;
	return ((a * t + b) * t + c) * t;
};

const axisSlope = (t: number, p1: number, p2: number): number => {
	const c = 3 * p1;
	const b = 3 * p2 - 6 * p1;
	const a = 1 - 3 * p2 + 3 * p1;
	return (3 * a * t + 2 * b) * t + c;
};

const assertControlPoints = (ease: Ease): void => {
	const points = [ease.x1, ease.y1, ease.x2, ease.y2];
	if (!points.every((value) => Number.isFinite(value))) {
		throw new Error(
			`Ease: control points must be finite, got (${points.join(", ")})`,
		);
	}
	if (ease.x1 < 0 || ease.x1 > 1 || ease.x2 < 0 || ease.x2 > 1) {
		throw new Error(
			`Ease: x control points must be within [0, 1] so the curve stays a function of time, got x1=${ease.x1}, x2=${ease.x2}`,
		);
	}
};

const buildTable = (ease: Ease): Table => {
	assertControlPoints(ease);
	const xs = new Float64Array(TABLE_SAMPLES);
	for (let i = 0; i < TABLE_SAMPLES; i++) {
		xs[i] = axis(i / (TABLE_SAMPLES - 1), ease.x1, ease.x2);
	}
	return { x1: ease.x1, x2: ease.x2, xs };
};

const tableFor = (ease: Ease): Float64Array => {
	const cached = tables.get(ease);
	if (cached && cached.x1 === ease.x1 && cached.x2 === ease.x2) {
		return cached.xs;
	}
	const table = buildTable(ease);
	tables.set(ease, table);
	return table.xs;
};

/**
 * Invert `x(t) = phase` for `phase` in `(0, 1)`: seed from the sample table's
 * bracketing interval, then Newton-Raphson kept inside that bracket, falling
 * back to bisection wherever the slope goes flat.
 */
const solveT = (
	ease: Ease,
	phase: number,
	xs: Float64Array,
): number => {
	const last = xs.length - 1;
	let index = 1;
	while (index < last && xs[index]! < phase) {
		index++;
	}
	let lo = (index - 1) / last;
	let hi = index / last;
	const xLo = xs[index - 1]!;
	const xHi = xs[index]!;
	let t =
		xHi > xLo ? lo + ((phase - xLo) / (xHi - xLo)) * (hi - lo) : lo;

	for (let i = 0; i < SOLVE_ITERATIONS; i++) {
		const error = axis(t, ease.x1, ease.x2) - phase;
		if (Math.abs(error) <= SOLVE_EPSILON) {
			return t;
		}
		if (error > 0) {
			hi = t;
		} else {
			lo = t;
		}
		const slope = axisSlope(t, ease.x1, ease.x2);
		const next =
			slope > SOLVE_EPSILON ? t - error / slope : (lo + hi) / 2;
		t = next > lo && next < hi ? next : (lo + hi) / 2;
	}
	return t;
};

/**
 * A cubic-bezier easing curve — the only easing representation in the engine.
 *
 * Four control floats (`P1 = (x1, y1)`, `P2 = (x2, y2)`; `P0` and `P3` are
 * pinned at the unit corners), evaluated by solving `x(t) = phase` and
 * returning `y(t)`. The x controls must stay within `[0, 1]` so the curve
 * remains a function of time; the y controls are unbounded, which is what
 * gives the `Back` presets their anticipation and overshoot.
 *
 * Instances are immutable: assign the {@link Ease.Linear typed presets}
 * directly (never a name string), and use {@link copy} when a container needs
 * its own instance. Presets are frozen, so writing through one throws.
 *
 * @example
 * const alpha = Ease.OutCubic.at(timeline.t());
 * const custom = new Ease(0.2, 0.9, 0.4, 1);
 */
@serializable("Ease")
export class Ease implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	/** `y = x`. Exact. */
	static readonly Linear: Ease = Object.freeze(
		new Ease(0, 0, 1, 1, "linear"),
	);

	/** `t²`. Exact. */
	static readonly InQuad: Ease = Object.freeze(
		new Ease(UNIFORM_X1, 0, UNIFORM_X2, 1 / 3, "inQuad"),
	);

	/** `1 - (1 - t)²`. Exact. */
	static readonly OutQuad: Ease = Object.freeze(
		new Ease(UNIFORM_X1, 2 / 3, UNIFORM_X2, 1, "outQuad"),
	);

	/**
	 * Symmetric quadratic. Approximate: the piecewise closed form is not a
	 * single cubic bezier, so this is the conventional CSS-style stand-in.
	 */
	static readonly InOutQuad: Ease = Object.freeze(
		new Ease(0.45, 0, 0.55, 1, "inOutQuad"),
	);

	/** `t³`. Exact. */
	static readonly InCubic: Ease = Object.freeze(
		new Ease(UNIFORM_X1, 0, UNIFORM_X2, 0, "inCubic"),
	);

	/** `1 - (1 - t)³`. Exact. */
	static readonly OutCubic: Ease = Object.freeze(
		new Ease(UNIFORM_X1, 1, UNIFORM_X2, 1, "outCubic"),
	);

	/**
	 * Symmetric cubic. Approximate, for the same reason as
	 * {@link Ease.InOutQuad}.
	 */
	static readonly InOutCubic: Ease = Object.freeze(
		new Ease(0.65, 0, 0.35, 1, "inOutCubic"),
	);

	/** Anticipates below zero, then drives in. Exact. */
	static readonly InBack: Ease = Object.freeze(
		new Ease(UNIFORM_X1, 0, UNIFORM_X2, -BACK / 3, "inBack"),
	);

	/** Overshoots past one, then settles. Exact. */
	static readonly OutBack: Ease = Object.freeze(
		new Ease(UNIFORM_X1, (BACK + 3) / 3, UNIFORM_X2, 1, "outBack"),
	);

	/**
	 * Anticipates and overshoots. Approximate, for the same reason as
	 * {@link Ease.InOutQuad}.
	 */
	static readonly InOutBack: Ease = Object.freeze(
		new Ease(0.68, -0.6, 0.32, 1.6, "inOutBack"),
	);

	@serialize() readonly x1: number;
	@serialize() readonly y1: number;
	@serialize() readonly x2: number;
	@serialize() readonly y2: number;

	/** Descriptive name for debugging and editor display; never resolved as a key. */
	@serialize() readonly label: string;

	constructor(
		x1: number = 0,
		y1: number = 0,
		x2: number = 1,
		y2: number = 1,
		label: string = "",
	) {
		this.x1 = x1;
		this.y1 = y1;
		this.x2 = x2;
		this.y2 = y2;
		this.label = label;
		assertControlPoints(this);
	}

	/**
	 * Eased value at `phase`. The phase is clamped to `[0, 1]`; the result is
	 * not, so overshooting curves keep their overshoot.
	 *
	 * @throws if the control points are out of range — the guard that catches
	 * a bad curve loaded from JSON at first use.
	 */
	at(phase: number): number {
		const xs = tableFor(this);
		if (phase <= 0) {
			return 0;
		}
		if (phase >= 1) {
			return 1;
		}
		if (this.x1 === this.y1 && this.x2 === this.y2) {
			return phase;
		}
		return axis(solveT(this, phase, xs), this.y1, this.y2);
	}

	/** An independent, writable instance with the same curve. */
	copy(): Ease {
		return new Ease(this.x1, this.y1, this.x2, this.y2, this.label);
	}
}

/**
 * Every preset, keyed by the id authored data names it with — the one table
 * both authored JSON (vfx defs) and authored TypeScript (sequence ops) resolve
 * through, so an ease reference is never an ad-hoc string map per call site.
 *
 * @example
 * const ease = easePreset(params.easing ?? "linear");
 */
export const EASE_PRESETS = {
	linear: Ease.Linear,
	inQuad: Ease.InQuad,
	outQuad: Ease.OutQuad,
	inOutQuad: Ease.InOutQuad,
	inCubic: Ease.InCubic,
	outCubic: Ease.OutCubic,
	inOutCubic: Ease.InOutCubic,
	inBack: Ease.InBack,
	outBack: Ease.OutBack,
	inOutBack: Ease.InOutBack,
} as const satisfies Readonly<Record<string, Ease>>;

/**
 * The ids {@link EASE_PRESETS} accepts. Authored TypeScript takes this type
 * rather than `string`, so a misspelled preset fails to compile.
 */
export type EasePresetId = keyof typeof EASE_PRESETS;

/** Preset ids in table order, for editor pickers and error messages. */
export const EASE_PRESET_IDS = Object.keys(
	EASE_PRESETS,
) as ReadonlyArray<EasePresetId>;

/**
 * Resolve a preset id to its curve.
 *
 * @throws if the id names no preset — a dangling reference from data
 * TypeScript could not check (a scene file, a `.vfx.json`) fails loudly here
 * rather than silently easing linearly.
 */
export const easePreset = (id: string): Ease => {
	const preset = EASE_PRESETS[id as EasePresetId];
	if (!preset) {
		throw new Error(
			`Ease: unknown preset "${id}"; expected one of ${EASE_PRESET_IDS.join(", ")}`,
		);
	}
	return preset;
};
