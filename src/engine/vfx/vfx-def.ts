import { Ease, EASE_PRESET_IDS, easePreset } from "../animation/ease";
import {
	keyframe,
	type Keyframe,
	KeyframesColor,
	KeyframesNumber,
} from "../animation/keyframes";
import { type QuadBlend, QUAD_BLENDS } from "../render/blend";
import { ColorResolver } from "../render/color-resolver";
import type { SerializableValue } from "../serialization/serializable-value";
import { VFX_RIBBON_PATHS, type VfxRibbonPath } from "./ribbon-path";
import {
	describeVfxRenderSlots,
	isAllocatedVfxSlot,
	VFX_MAX_RENDER_SLOTS,
} from "./vfx-render-slots";
import {
	NO_VFX_WEATHER_SCALING,
	VFX_WEATHER_SOURCES,
	type VfxWeatherScaling,
} from "./vfx-weather-influence";

/**
 * The VFX effect schema: what an authored `*.vfx.json` may say, and what it
 * means once validated.
 *
 * An **effect** is a list of **parts**, so one def expresses a composite (a
 * beam plus its motes, flames plus smoke) without any notion of nesting. `kind`
 * discriminates them: `emitter` is a particle pool, `ribbon` is a path generator
 * widened along its length. A ribbon carries no `capacity`, no collision and no
 * spawn shape — those are particle concepts, and the union member simply does
 * not have them, so authoring one is a parse error rather than a field quietly
 * ignored.
 *
 * Validation runs once, at registration, in every build — see
 * {@link validateVfxCatalog}. Everything downstream consumes the validated
 * shapes, where a spawn shape is a discriminated union rather than a bag of
 * optional numbers, angles are radians, colours are numeric {@link RGBA} rather
 * than css strings, pool capacity is already derived, and an `onDeath`
 * reference is known to name a def that can actually burst. Unknown keys are
 * rejected too: a typo in authored JSON is a content bug that must fail loudly
 * rather than silently do nothing.
 *
 * The capabilities the plan called for are all here: decal specs, and both
 * collision modes — cheap `"tiles"` cell tests and per-segment `"raycast"`,
 * which is the one that can see dynamic bodies. Frame-strip playback is
 * deliberately absent: every shipped effect is procedural, and a flipbook with
 * no art behind it was schema nobody could author against.
 */

/** Authored angles are degrees; everything downstream is radians. */
const DEG_TO_RAD = Math.PI / 180;

/** An inclusive numeric range a per-particle value is drawn uniformly from. */
export type VfxRange = Readonly<{ min: number; max: number }>;

/**
 * Where new particles appear.
 *
 * - `point` — at the emitter origin.
 * - `box` — uniformly inside a `width * height` rectangle centred on it.
 * - `camera-band` — uniformly along a horizontal band sized off the active
 *   camera's visible bounds, which is what lets rain follow the view without
 *   any emitter knowing where the player is. A part using it is skipped in a
 *   world with no active camera.
 */
export type VfxSpawnShape =
	| Readonly<{ kind: "point" }>
	| Readonly<{ kind: "box"; width: number; height: number }>
	| Readonly<{
			kind: "camera-band";
			/** Band width as a multiple of the visible width. */
			widthScale: number;
			/** Band height in world units. */
			height: number;
			/**
			 * Band centre offset from the top of the visible bounds, world units.
			 * Negative lifts the band above the view — where rain starts.
			 */
			offsetY: number;
	  }>;

const VFX_COLLISION_RESPONSES = [
	"die",
	"rest",
	"passThrough",
] as const;

/** What a particle does when it enters a tile that blocks it. */
export type VfxCollisionResponse =
	(typeof VFX_COLLISION_RESPONSES)[number];

const VFX_COLLISION_CELLS = ["solid", "rain-blocking"] as const;

/**
 * Which merged tile set a colliding part tests against, and with it whether the
 * part is precipitation.
 *
 * - `solid` — the merged solid-tile set. What anything that falls and settles
 *   wants: it stops where the player would.
 * - `rain-blocking` — the rain-blocking classification (`blockingLayers`), so a
 *   tarpaulin marked `"blocks"` stops drops it never stopped the player with and
 *   a grate marked `"passes"` lets them fall through. Declaring it also marks
 *   the part **as precipitation**: its particles are confined to that
 *   classification's sky-reached columns, so nothing spawns or drifts under an
 *   overhang.
 */
export type VfxCollisionCells = (typeof VFX_COLLISION_CELLS)[number];

/**
 * How a particle interacts with the world.
 *
 * `tiles` tests the particle's cell against a merged tile set — cheap, and
 * enough for rain, splashes, and settling leaves — chosen by {@link cells}.
 * `raycast` casts the particle's whole move segment against the physics world
 * instead, so it hits **dynamic bodies** as well as terrain, lands on the exact
 * surface point, and cannot tunnel through a thin ledge at speed. It is the
 * expensive mode: one cast per moving particle per frame, which is affordable
 * for a burst of blood and ruinous for a sky full of rain.
 *
 * `restChance` is a **per-particle pre-roll**: a particle that fails the roll
 * passes through regardless of `response`, which is how a drift of leaves has
 * some catch on a ledge and the rest fall past it.
 */
export type VfxCollision =
	| Readonly<{ mode: "none" }>
	| Readonly<{
			mode: "tiles";
			cells: VfxCollisionCells;
			response: VfxCollisionResponse;
			/** Probability `0..1` that a given particle reacts at all. */
			restChance: number;
	  }>
	| Readonly<{
			mode: "raycast";
			response: VfxCollisionResponse;
			/** Probability `0..1` that a given particle reacts at all. */
			restChance: number;
	  }>;

const VFX_SIM_SPACES = ["local", "world"] as const;

/**
 * Whether particle positions are relative to the emitter's host (`local`, so
 * the effect rides along) or baked into world space at spawn (`world`, so a
 * trail stays where it was made).
 */
export type VfxSimSpace = (typeof VFX_SIM_SPACES)[number];

/**
 * Over-life tracks, sampled by normalized particle age. A `null` track means
 * "leave this alone": scale and alpha hold at one, colour at white, rotation
 * takes no extra turn.
 */
export type VfxTracks = Readonly<{
	/** Multiplies the particle's drawn size. */
	scale: KeyframesNumber | null;
	/** Multiplies the colour track's alpha. */
	alpha: KeyframesNumber | null;
	color: KeyframesColor | null;
	/** Radians added on top of initial rotation and accumulated spin. */
	rotation: KeyframesNumber | null;
}>;

export type { VfxWeatherScaling };

/**
 * Over-life tracks for a decal, sampled by normalized age — the same meaning as
 * {@link VfxTracks}, minus `scale` and `rotation`, which a mark pinned to a
 * surface does not do.
 */
export type VfxDecalTracks = Readonly<{
	alpha: KeyframesNumber | null;
	color: KeyframesColor | null;
}>;

/**
 * The oriented quad a colliding particle leaves behind: a blood smear, a
 * scorch, the ground mark a rested leaf becomes.
 *
 * A decal is **not a particle and not an entity**. It goes into the store's
 * capped ring buffer, which recycles its oldest entry rather than growing, so a
 * long fight cannot turn into unbounded memory and nothing a decal holds is
 * reachable from `serializeWorld`.
 *
 * Where the mark lands is decided at impact, not here: a hit on terrain pins it
 * to the world, a hit on a dynamic body stores it as an offset in that entity's
 * body space so the smear rides its victim. The def only says what the mark
 * looks like and how long it lasts.
 */
export type VfxDecalSpec = Readonly<{
	/** Render layer id; resolved against the scene's authored layer list. */
	layer: string;
	/** Sort order within the layer, `0..999`. */
	order: number;
	blend: QuadBlend;
	/** Image url, or `null` for a solid tinted quad. */
	texture: string | null;
	/** Quad width along the surface, in world units. */
	size: VfxRange;
	/** Quad height as a multiple of its width. */
	aspect: number;
	/** Radians of jitter added to the surface-derived orientation. */
	rotation: VfxRange;
	/** How long the mark lasts, in seconds. */
	lifetime: VfxRange;
	tracks: VfxDecalTracks;
}>;

/** A validated particle-emitter part. */
export type VfxEmitterPart = Readonly<{
	kind: "emitter";
	/** Render layer id; resolved against the scene's authored layer list. */
	layer: string;
	/** Sort order within the layer, `0..999`. */
	order: number;
	blend: QuadBlend;
	space: VfxSimSpace;
	/** Continuous emission, particles per second before weather scaling. */
	rate: number;
	/** Particles emitted at effect start and on every one-shot burst. */
	burst: number;
	spawn: VfxSpawnShape;
	/** Particle lifetime in seconds. */
	lifetime: VfxRange;
	/** Drawn size in world units, before the scale track. */
	size: VfxRange;
	/** Initial speed in world units per second. */
	speed: VfxRange;
	/**
	 * Initial heading in radians, measured from `+x` toward `+y`. World y points
	 * **down**, so `PI / 2` is straight down.
	 */
	angle: VfxRange;
	/** Downward acceleration in world units per second squared. */
	gravity: number;
	/** Linear drag coefficient, per second. */
	drag: number;
	/** Initial rotation in radians. */
	rotation: VfxRange;
	/** Rotation rate in radians per second. */
	spin: VfxRange;
	/**
	 * How far a particle stretches along its velocity, in **seconds of travel** —
	 * the quad grows by `speed * stretch` world units, so a fast raindrop is a
	 * long stripe and a slow ember stays a dot.
	 */
	stretch: number;
	/**
	 * Wind acceleration in world units per second squared at full signed wind.
	 * Multiplied by `sampleWind`, so sign and gusting come from the weather.
	 */
	wind: number;
	weather: VfxWeatherScaling;
	collision: VfxCollision;
	/**
	 * The mark a colliding particle leaves, or `null`. Requires a collision mode:
	 * a decal on a part that never collides could never appear.
	 */
	decal: VfxDecalSpec | null;
	/** Def id burst at a particle's death position, or `null`. */
	onDeath: string | null;
	/** Image url, or `null` for solid tinted quads — the cheap batched path. */
	texture: string | null;
	tracks: VfxTracks;
	/**
	 * Pool size, derived from rate, lifetime, and burst — never authored, so a
	 * hand-typed capacity can never be too small for the emission it must hold.
	 */
	capacity: number;
}>;

const VFX_RIBBON_ORIGINS = ["host", "camera"] as const;

/**
 * Where a ribbon's path starts.
 *
 * - `host` — at the emitter origin, like any hosted effect.
 * - `camera` — scattered uniformly over the active camera's visible bounds, so
 *   wind lines cross the view without an emitter knowing where the player is. A
 *   part using it is skipped in a world with no active camera.
 *
 * This is deliberately **not** {@link VfxSpawnShape}: a box or a camera band
 * scatters particles, and a ribbon has one origin, one length and one heading.
 */
export type VfxRibbonOrigin = (typeof VFX_RIBBON_ORIGINS)[number];

/**
 * How wide a ribbon is along its arc.
 *
 * `base` is the world-unit width at full thickness; `profile` multiplies it by a
 * curve over normalized arc length; the two taper fractions ramp each end to
 * nothing over that share of the length. Taper is a property of the ribbon
 * rather than an approximation of one, which is the thing chaining particles
 * could never give.
 */
export type VfxRibbonWidth = Readonly<{
	base: number;
	/** Multiplier over normalized arc length; `null` is a flat ribbon. */
	profile: KeyframesNumber | null;
	/** Fraction of the length the head ramps up over, `0..1`. */
	taperHead: number;
	/** Fraction of the length the tail ramps down over, `0..1`. */
	taperTail: number;
}>;

/**
 * Over-life tracks for a ribbon, sampled by normalized age — the same meaning as
 * {@link VfxTracks}, minus `rotation`, which a path already decides. `scale`
 * multiplies the whole width profile.
 */
export type VfxRibbonTracks = Readonly<{
	scale: KeyframesNumber | null;
	alpha: KeyframesNumber | null;
	color: KeyframesColor | null;
}>;

/**
 * A ribbon's throb: a curve sampled at **phase**, not at age.
 *
 * `curve` is one cycle, sampled at `fract(time * rate + seed * spread)` off the
 * shared ambient clock and multiplied into the ribbon's width. Nothing is
 * ticked and nothing is stored — an oscillator is not a type here, it is a
 * stateless read of a time source, so a pulse survives a save/restore with its
 * phase intact and stays coherent with every other ambient motion for free.
 *
 * `spread` scatters a band's ribbons across the cycle so several strands of one
 * beam breathe out of step; at zero they throb as one.
 */
export type VfxRibbonPulse = Readonly<{
	/** Cycles per second. */
	rate: number;
	/** Width multiplier over one cycle, sampled at phase `0..1`. */
	curve: KeyframesNumber;
	/** Per-ribbon phase offset drawn off its seed, in cycles. */
	spread: number;
}>;

/**
 * A validated ribbon part: a generated path, widened and tinted along its arc.
 *
 * It carries no `capacity` (the pool is `count` ribbons, authored rather than
 * derived from a rate), no `collision` and no `spawn` — a ribbon is a curve, not
 * a cloud of dots.
 *
 * `weather` scales **both** the live count and the drawn opacity by the same
 * influence, so one authored knob makes wind lines absent in a breeze, faint as
 * it picks up and prominent in a gale, without either half popping.
 */
export type VfxRibbonPart = Readonly<{
	kind: "ribbon";
	/** Render layer id; resolved against the scene's authored layer list. */
	layer: string;
	/** Sort order within the layer, `0..999`. */
	order: number;
	blend: QuadBlend;
	space: VfxSimSpace;
	origin: VfxRibbonOrigin;
	/** Ribbons alive at once, before weather scaling. */
	count: number;
	/** Quads along one ribbon; it is drawn from `segments + 1` points. */
	segments: number;
	/** Ribbon lifetime in seconds. */
	lifetime: VfxRange;
	/** Path length in world units. */
	length: VfxRange;
	path: VfxRibbonPath;
	width: VfxRibbonWidth;
	/** Phase-sampled width throb, or `null` for a steady ribbon. */
	pulse: VfxRibbonPulse | null;
	tracks: VfxRibbonTracks;
	/**
	 * Downwind drift in world units per second at full signed wind, so a ribbon
	 * travels with the weather rather than hanging in place.
	 */
	wind: number;
	weather: VfxWeatherScaling;
}>;

/** A validated part of either kind. */
export type VfxPart = VfxEmitterPart | VfxRibbonPart;

/** A validated effect: an id and its parts. */
export type VfxDef = Readonly<{
	id: string;
	parts: readonly VfxPart[];
}>;

/** A validated catalog, ready for the registry. */
export type VfxCatalog = Readonly<{
	defs: ReadonlyMap<string, VfxDef>;
}>;

/**
 * Slack on the derived pool capacity, absorbing the sub-frame spread between a
 * spawn accumulator's fractional debt and the oldest particle's expiry.
 */
const CAPACITY_SLACK = 1.2;

/**
 * Hard ceiling on one part's pool. A def that wants more has almost certainly
 * authored a rate or a lifetime by the wrong order of magnitude, and the whole
 * point of validating at load is to say so before eight megabytes of typed
 * array appear.
 */
const VFX_MAX_PARTICLES_PER_PART = 8192;

/**
 * Hard ceilings on one ribbon part, for the same reason as the particle one: a
 * `count` or a `segments` off by an order of magnitude is a content bug, and
 * their product is the quad count the part costs every frame.
 */
const VFX_MAX_RIBBONS_PER_PART = 256;
const VFX_MAX_RIBBON_SEGMENTS = 128;

const colors = new ColorResolver();

const invalid = (source: string, message: string): Error =>
	new Error(`${source}: ${message}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value);

const record = (
	source: string,
	label: string,
	value: unknown,
	known: ReadonlyArray<string>,
): Record<string, unknown> => {
	if (!isRecord(value)) {
		throw invalid(source, `${label} must be an object.`);
	}
	for (const key of Object.keys(value)) {
		if (!known.includes(key)) {
			throw invalid(
				source,
				`${label} has unknown key "${key}". Known keys: ${known.join(", ")}.`,
			);
		}
	}
	return value;
};

const num = (
	source: string,
	label: string,
	value: unknown,
	fallback?: number,
): number => {
	if (value === undefined) {
		if (fallback === undefined) {
			throw invalid(source, `${label} is required.`);
		}
		return fallback;
	}
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw invalid(
			source,
			`${label} must be a finite number, got ${JSON.stringify(value)}.`,
		);
	}
	return value;
};

const nonNegative = (
	source: string,
	label: string,
	value: unknown,
	fallback?: number,
): number => {
	const parsed = num(source, label, value, fallback);
	if (parsed < 0) {
		throw invalid(
			source,
			`${label} is ${parsed}; it must not be negative.`,
		);
	}
	return parsed;
};

const unit = (
	source: string,
	label: string,
	value: unknown,
	fallback?: number,
): number => {
	const parsed = num(source, label, value, fallback);
	if (parsed < 0 || parsed > 1) {
		throw invalid(
			source,
			`${label} is ${parsed}; it is a normalized factor in 0..1.`,
		);
	}
	return parsed;
};

const text = (
	source: string,
	label: string,
	value: unknown,
): string => {
	if (typeof value !== "string" || value.length === 0) {
		throw invalid(source, `${label} must be a non-empty string.`);
	}
	return value;
};

const oneOf = <T extends string>(
	source: string,
	label: string,
	value: unknown,
	allowed: ReadonlyArray<T>,
	fallback: T,
): T => {
	if (value === undefined) {
		return fallback;
	}
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		throw invalid(
			source,
			`${label} is ${JSON.stringify(value)}; it must be one of ${allowed.join(", ")}.`,
		);
	}
	return value as T;
};

const RANGE_KEYS = ["min", "max"] as const;

const range = (
	source: string,
	label: string,
	value: unknown,
	fallback?: VfxRange,
): VfxRange => {
	if (value === undefined) {
		if (!fallback) {
			throw invalid(source, `${label} is required.`);
		}
		return fallback;
	}
	const raw = record(source, label, value, RANGE_KEYS);
	const min = num(source, `${label}.min`, raw.min);
	const max = num(source, `${label}.max`, raw.max);
	if (max < min) {
		throw invalid(
			source,
			`${label} is ${min}..${max}; a range needs min <= max.`,
		);
	}
	return { min, max };
};

const degrees = (
	source: string,
	label: string,
	value: unknown,
	fallback: number,
): number => nonNegative(source, label, value, fallback) * DEG_TO_RAD;

const degreesRange = (
	source: string,
	label: string,
	value: unknown,
	fallback: VfxRange,
): VfxRange => {
	const degrees = range(source, label, value, fallback);
	return {
		min: degrees.min * DEG_TO_RAD,
		max: degrees.max * DEG_TO_RAD,
	};
};

const positiveRange = (
	source: string,
	label: string,
	value: unknown,
	fallback?: VfxRange,
): VfxRange => {
	const parsed = range(source, label, value, fallback);
	if (parsed.min <= 0) {
		throw invalid(
			source,
			`${label} starts at ${parsed.min}; it must be positive.`,
		);
	}
	return parsed;
};

const ease = (
	source: string,
	label: string,
	value: unknown,
): Ease => {
	if (value === undefined) {
		return Ease.Linear;
	}
	if (typeof value === "string") {
		try {
			return easePreset(value);
		} catch {
			throw invalid(
				source,
				`${label} names ease "${value}", which is not a preset. Known presets: ${EASE_PRESET_IDS.join(", ")}; or give four bezier control floats.`,
			);
		}
	}
	if (!Array.isArray(value) || value.length !== 4) {
		throw invalid(
			source,
			`${label} must be a preset name or four bezier control floats [x1, y1, x2, y2].`,
		);
	}
	return new Ease(
		num(source, `${label}[0]`, value[0]),
		num(source, `${label}[1]`, value[1]),
		num(source, `${label}[2]`, value[2]),
		num(source, `${label}[3]`, value[3]),
	);
};

const KEY_KEYS = ["t", "value", "ease"] as const;

const parseKeys = <T extends SerializableValue>(
	source: string,
	label: string,
	value: unknown,
	parseValue: (label: string, raw: unknown) => T,
): ReadonlyArray<Keyframe<T>> => {
	if (!Array.isArray(value) || value.length === 0) {
		throw invalid(
			source,
			`${label} must be a non-empty array of keyframes.`,
		);
	}
	return value.map((entry, index) => {
		const key = `${label}[${index}]`;
		const raw = record(source, key, entry, KEY_KEYS);
		return keyframe(
			unit(source, `${key}.t`, raw.t),
			parseValue(`${key}.value`, raw.value),
			ease(source, `${key}.ease`, raw.ease),
		);
	});
};

const numberTrack = (
	source: string,
	label: string,
	value: unknown,
): KeyframesNumber | null =>
	value === undefined
		? null
		: new KeyframesNumber(
				parseKeys(source, label, value, (keyLabel, raw) =>
					num(source, keyLabel, raw),
				),
			);

const colorTrack = (
	source: string,
	label: string,
	value: unknown,
): KeyframesColor | null =>
	value === undefined
		? null
		: new KeyframesColor(
				parseKeys(source, label, value, (keyLabel, raw) =>
					colors.resolve(text(source, keyLabel, raw)),
				),
			);

const TRACK_KEYS = ["scale", "alpha", "color", "rotation"] as const;

const tracks = (
	source: string,
	label: string,
	value: unknown,
): VfxTracks => {
	if (value === undefined) {
		return { scale: null, alpha: null, color: null, rotation: null };
	}
	const raw = record(source, label, value, TRACK_KEYS);
	return {
		scale: numberTrack(source, `${label}.scale`, raw.scale),
		alpha: numberTrack(source, `${label}.alpha`, raw.alpha),
		color: colorTrack(source, `${label}.color`, raw.color),
		rotation:
			raw.rotation === undefined
				? null
				: new KeyframesNumber(
						parseKeys(
							source,
							`${label}.rotation`,
							raw.rotation,
							(keyLabel, raw2) =>
								num(source, keyLabel, raw2) * DEG_TO_RAD,
						),
					),
	};
};

const SPAWN_KEYS = [
	"shape",
	"width",
	"height",
	"widthScale",
	"offsetY",
] as const;

const SPAWN_SHAPES = ["point", "box", "camera-band"] as const;

const spawnShape = (
	source: string,
	label: string,
	value: unknown,
): VfxSpawnShape => {
	if (value === undefined) {
		return { kind: "point" };
	}
	const raw = record(source, label, value, SPAWN_KEYS);
	const shape = oneOf(
		source,
		`${label}.shape`,
		raw.shape,
		SPAWN_SHAPES,
		"point",
	);
	if (shape === "point") {
		return { kind: "point" };
	}
	if (shape === "box") {
		return {
			kind: "box",
			width: nonNegative(source, `${label}.width`, raw.width),
			height: nonNegative(source, `${label}.height`, raw.height),
		};
	}
	return {
		kind: "camera-band",
		widthScale: nonNegative(
			source,
			`${label}.widthScale`,
			raw.widthScale,
			1,
		),
		height: nonNegative(source, `${label}.height`, raw.height),
		offsetY: num(source, `${label}.offsetY`, raw.offsetY, 0),
	};
};

const ZERO_RANGE: VfxRange = { min: 0, max: 0 };

const withinLayerOrder = (
	source: string,
	label: string,
	value: unknown,
): number => {
	const order = Math.round(num(source, `${label}.order`, value, 0));
	if (order < 0 || order > 999) {
		throw invalid(
			source,
			`${label}.order is ${order}; a within-layer order is 0..999.`,
		);
	}
	return order;
};

const boundedCount = (
	source: string,
	label: string,
	value: unknown,
	ceiling: number,
	fallback?: number,
): number => {
	const count = Math.round(
		nonNegative(source, label, value, fallback),
	);
	if (count < 1 || count > ceiling) {
		throw invalid(
			source,
			`${label} is ${count}; it must be 1..${ceiling}.`,
		);
	}
	return count;
};

const NONE_COLLISION_KEYS = ["mode"] as const;
const TILES_COLLISION_KEYS = [
	"mode",
	"cells",
	"response",
	"restChance",
] as const;
const RAYCAST_COLLISION_KEYS = [
	"mode",
	"response",
	"restChance",
] as const;
const COLLISION_MODES = ["none", "tiles", "raycast"] as const;

/**
 * Parse a collision mode and the parameters that mode alone owns, so a `cells`
 * on a raycast part is an unknown key rather than a setting quietly dropped —
 * the same per-member key discipline the path generators use.
 */
const collision = (
	source: string,
	label: string,
	value: unknown,
): VfxCollision => {
	if (value === undefined) {
		return { mode: "none" };
	}
	if (!isRecord(value)) {
		throw invalid(source, `${label} must be an object.`);
	}
	const mode = oneOf(
		source,
		`${label}.mode`,
		value.mode,
		COLLISION_MODES,
		"none",
	);
	if (mode === "none") {
		record(source, label, value, NONE_COLLISION_KEYS);
		return { mode: "none" };
	}
	if (mode === "raycast") {
		const raw = record(source, label, value, RAYCAST_COLLISION_KEYS);
		return {
			mode: "raycast",
			response: oneOf(
				source,
				`${label}.response`,
				raw.response,
				VFX_COLLISION_RESPONSES,
				"die",
			),
			restChance: unit(
				source,
				`${label}.restChance`,
				raw.restChance,
				1,
			),
		};
	}
	const raw = record(source, label, value, TILES_COLLISION_KEYS);
	return {
		mode: "tiles",
		cells: oneOf(
			source,
			`${label}.cells`,
			raw.cells,
			VFX_COLLISION_CELLS,
			"solid",
		),
		response: oneOf(
			source,
			`${label}.response`,
			raw.response,
			VFX_COLLISION_RESPONSES,
			"die",
		),
		restChance: unit(
			source,
			`${label}.restChance`,
			raw.restChance,
			1,
		),
	};
};

const DECAL_TRACK_KEYS = ["alpha", "color"] as const;

const decalTracks = (
	source: string,
	label: string,
	value: unknown,
): VfxDecalTracks => {
	if (value === undefined) {
		return { alpha: null, color: null };
	}
	const raw = record(source, label, value, DECAL_TRACK_KEYS);
	return {
		alpha: numberTrack(source, `${label}.alpha`, raw.alpha),
		color: colorTrack(source, `${label}.color`, raw.color),
	};
};

const DECAL_KEYS = [
	"layer",
	"order",
	"blend",
	"texture",
	"size",
	"aspect",
	"rotation",
	"lifetime",
	"tracks",
] as const;

const decal = (
	source: string,
	label: string,
	value: unknown,
): VfxDecalSpec | null => {
	if (value === undefined || value === null) {
		return null;
	}
	const raw = record(source, label, value, DECAL_KEYS);
	const aspect = num(source, `${label}.aspect`, raw.aspect, 1);
	if (aspect <= 0) {
		throw invalid(
			source,
			`${label}.aspect is ${aspect}; a decal with no height draws nothing.`,
		);
	}
	return {
		layer: text(source, `${label}.layer`, raw.layer),
		order: withinLayerOrder(source, label, raw.order),
		blend: oneOf(
			source,
			`${label}.blend`,
			raw.blend,
			QUAD_BLENDS,
			"normal",
		),
		texture:
			raw.texture === undefined || raw.texture === null
				? null
				: text(source, `${label}.texture`, raw.texture),
		size: positiveRange(source, `${label}.size`, raw.size),
		aspect,
		rotation: degreesRange(
			source,
			`${label}.rotation`,
			raw.rotation,
			ZERO_RANGE,
		),
		lifetime: positiveRange(
			source,
			`${label}.lifetime`,
			raw.lifetime,
		),
		tracks: decalTracks(source, `${label}.tracks`, raw.tracks),
	};
};

const weatherScaling = (
	source: string,
	label: string,
	value: unknown,
): VfxWeatherScaling => {
	if (value === undefined) {
		return NO_VFX_WEATHER_SCALING;
	}
	const raw = record(source, label, value, VFX_WEATHER_SOURCES);
	return Object.fromEntries(
		VFX_WEATHER_SOURCES.map((weatherSource) => [
			weatherSource,
			unit(
				source,
				`${label}.${weatherSource}`,
				raw[weatherSource],
				0,
			),
		]),
	) as VfxWeatherScaling;
};

const EMISSION_KEYS = ["rate", "burst"] as const;

const capacityFor = (
	source: string,
	label: string,
	rate: number,
	burst: number,
	lifetimeMax: number,
): number => {
	const capacity = Math.max(
		1,
		Math.ceil(rate * lifetimeMax * CAPACITY_SLACK) + burst,
	);
	if (capacity > VFX_MAX_PARTICLES_PER_PART) {
		throw invalid(
			source,
			`${label} needs a pool of ${capacity} particles (rate ${rate}/s over ${lifetimeMax}s plus a burst of ${burst}), past the ${VFX_MAX_PARTICLES_PER_PART} ceiling. Lower the rate or the lifetime.`,
		);
	}
	return capacity;
};

const PART_KEYS = [
	"kind",
	"layer",
	"order",
	"blend",
	"space",
	"emission",
	"spawn",
	"lifetime",
	"size",
	"speed",
	"angle",
	"gravity",
	"drag",
	"rotation",
	"spin",
	"stretch",
	"wind",
	"weather",
	"collision",
	"decal",
	"onDeath",
	"texture",
	"tracks",
] as const;

const PART_KINDS = ["emitter", "ribbon"] as const;

const emitterPart = (
	source: string,
	label: string,
	value: unknown,
): VfxEmitterPart => {
	const raw = record(source, label, value, PART_KEYS);
	const emission = record(
		source,
		`${label}.emission`,
		raw.emission,
		EMISSION_KEYS,
	);
	const rate = nonNegative(
		source,
		`${label}.emission.rate`,
		emission.rate,
		0,
	);
	const burst = Math.round(
		nonNegative(source, `${label}.emission.burst`, emission.burst, 0),
	);
	if (rate === 0 && burst === 0) {
		throw invalid(
			source,
			`${label} emits nothing: it needs a rate, a burst, or both.`,
		);
	}
	const lifetime = positiveRange(
		source,
		`${label}.lifetime`,
		raw.lifetime,
	);
	const order = withinLayerOrder(source, label, raw.order);
	const spawn = spawnShape(source, `${label}.spawn`, raw.spawn);
	const space = oneOf(
		source,
		`${label}.space`,
		raw.space,
		VFX_SIM_SPACES,
		"world",
	);
	if (spawn.kind === "camera-band" && space === "local") {
		throw invalid(
			source,
			`${label} spawns in a camera band but simulates in local space; a band is placed from the camera, so its particles must live in world space.`,
		);
	}
	const collide = collision(
		source,
		`${label}.collision`,
		raw.collision,
	);
	const mark = decal(source, `${label}.decal`, raw.decal);
	if (mark && collide.mode === "none") {
		throw invalid(
			source,
			`${label} authors a decal but never collides; a mark is left where a particle hits something, so give it a collision mode.`,
		);
	}
	const texture =
		raw.texture === undefined || raw.texture === null
			? null
			: text(source, `${label}.texture`, raw.texture);
	return {
		kind: "emitter",
		layer: text(source, `${label}.layer`, raw.layer),
		order,
		blend: oneOf(
			source,
			`${label}.blend`,
			raw.blend,
			QUAD_BLENDS,
			"normal",
		),
		space,
		rate,
		burst,
		spawn,
		lifetime,
		size: positiveRange(source, `${label}.size`, raw.size),
		speed: range(source, `${label}.speed`, raw.speed, ZERO_RANGE),
		angle: degreesRange(
			source,
			`${label}.angle`,
			raw.angle,
			ZERO_RANGE,
		),
		gravity: num(source, `${label}.gravity`, raw.gravity, 0),
		drag: nonNegative(source, `${label}.drag`, raw.drag, 0),
		rotation: degreesRange(
			source,
			`${label}.rotation`,
			raw.rotation,
			ZERO_RANGE,
		),
		spin: degreesRange(source, `${label}.spin`, raw.spin, ZERO_RANGE),
		stretch: nonNegative(source, `${label}.stretch`, raw.stretch, 0),
		wind: num(source, `${label}.wind`, raw.wind, 0),
		weather: weatherScaling(source, `${label}.weather`, raw.weather),
		collision: collide,
		decal: mark,
		onDeath:
			raw.onDeath === undefined || raw.onDeath === null
				? null
				: text(source, `${label}.onDeath`, raw.onDeath),
		texture,
		tracks: tracks(source, `${label}.tracks`, raw.tracks),
		capacity: capacityFor(source, label, rate, burst, lifetime.max),
	};
};

const RIBBON_PART_KEYS = [
	"kind",
	"layer",
	"order",
	"blend",
	"space",
	"origin",
	"count",
	"segments",
	"lifetime",
	"length",
	"path",
	"width",
	"pulse",
	"tracks",
	"wind",
	"weather",
] as const;

const WANDER_PATH_KEYS = [
	"generator",
	"amplitude",
	"waves",
	"tilt",
] as const;

const VERTICAL_PATH_KEYS = [
	"generator",
	"lean",
	"bow",
	"sway",
] as const;

const HELIX_PATH_KEYS = [
	"generator",
	"radius",
	"turns",
	"spin",
	"topScale",
] as const;

/**
 * Parse a path generator and its own parameters. Each generator owns its key
 * list, so a `bolt` parameter on a `wander` path is an unknown key rather than a
 * value silently dropped.
 */
const ribbonPath = (
	source: string,
	label: string,
	value: unknown,
): VfxRibbonPath => {
	if (!isRecord(value)) {
		throw invalid(
			source,
			`${label} must be an object naming a generator: one of ${VFX_RIBBON_PATHS.join(", ")}.`,
		);
	}
	const generator = oneOf(
		source,
		`${label}.generator`,
		value.generator,
		VFX_RIBBON_PATHS,
		"wander",
	);
	switch (generator) {
		case "wander": {
			const raw = record(source, label, value, WANDER_PATH_KEYS);
			return {
				generator: "wander",
				amplitude: nonNegative(
					source,
					`${label}.amplitude`,
					raw.amplitude,
					0,
				),
				waves: nonNegative(source, `${label}.waves`, raw.waves, 1),
				tilt: degrees(source, `${label}.tilt`, raw.tilt, 0),
			};
		}
		case "vertical": {
			const raw = record(source, label, value, VERTICAL_PATH_KEYS);
			return {
				generator: "vertical",
				lean: nonNegative(source, `${label}.lean`, raw.lean, 0),
				bow: nonNegative(source, `${label}.bow`, raw.bow, 0),
				sway: nonNegative(source, `${label}.sway`, raw.sway, 0),
			};
		}
		case "helix": {
			const raw = record(source, label, value, HELIX_PATH_KEYS);
			return {
				generator: "helix",
				radius: nonNegative(source, `${label}.radius`, raw.radius),
				turns: nonNegative(source, `${label}.turns`, raw.turns, 1),
				spin: num(source, `${label}.spin`, raw.spin, 0),
				topScale: nonNegative(
					source,
					`${label}.topScale`,
					raw.topScale,
					1,
				),
			};
		}
	}
	const unhandled: never = generator;
	throw invalid(
		source,
		`${label} names generator "${String(unhandled)}", which has no parser.`,
	);
};

const WIDTH_KEYS = [
	"base",
	"profile",
	"taperHead",
	"taperTail",
] as const;

const ribbonWidth = (
	source: string,
	label: string,
	value: unknown,
): VfxRibbonWidth => {
	const raw = record(source, label, value, WIDTH_KEYS);
	const base = num(source, `${label}.base`, raw.base);
	if (base <= 0) {
		throw invalid(
			source,
			`${label}.base is ${base}; a ribbon with no width draws nothing.`,
		);
	}
	return {
		base,
		profile: numberTrack(source, `${label}.profile`, raw.profile),
		taperHead: unit(source, `${label}.taperHead`, raw.taperHead, 0),
		taperTail: unit(source, `${label}.taperTail`, raw.taperTail, 0),
	};
};

const PULSE_KEYS = ["rate", "curve", "spread"] as const;

const ribbonPulse = (
	source: string,
	label: string,
	value: unknown,
): VfxRibbonPulse | null => {
	if (value === undefined) {
		return null;
	}
	const raw = record(source, label, value, PULSE_KEYS);
	const curve = numberTrack(source, `${label}.curve`, raw.curve);
	if (!curve) {
		throw invalid(
			source,
			`${label} has no curve; a pulse is the curve it samples.`,
		);
	}
	return {
		rate: nonNegative(source, `${label}.rate`, raw.rate, 1),
		curve,
		spread: nonNegative(source, `${label}.spread`, raw.spread, 0),
	};
};

const RIBBON_TRACK_KEYS = ["scale", "alpha", "color"] as const;

const ribbonTracks = (
	source: string,
	label: string,
	value: unknown,
): VfxRibbonTracks => {
	if (value === undefined) {
		return { scale: null, alpha: null, color: null };
	}
	const raw = record(source, label, value, RIBBON_TRACK_KEYS);
	return {
		scale: numberTrack(source, `${label}.scale`, raw.scale),
		alpha: numberTrack(source, `${label}.alpha`, raw.alpha),
		color: colorTrack(source, `${label}.color`, raw.color),
	};
};

const ribbonPart = (
	source: string,
	label: string,
	value: unknown,
): VfxRibbonPart => {
	const raw = record(source, label, value, RIBBON_PART_KEYS);
	const origin = oneOf(
		source,
		`${label}.origin`,
		raw.origin,
		VFX_RIBBON_ORIGINS,
		"host",
	);
	const space = oneOf(
		source,
		`${label}.space`,
		raw.space,
		VFX_SIM_SPACES,
		"world",
	);
	if (origin === "camera" && space === "local") {
		throw invalid(
			source,
			`${label} starts from the camera but simulates in local space; a camera-placed ribbon must live in world space.`,
		);
	}
	return {
		kind: "ribbon",
		layer: text(source, `${label}.layer`, raw.layer),
		order: withinLayerOrder(source, label, raw.order),
		blend: oneOf(
			source,
			`${label}.blend`,
			raw.blend,
			QUAD_BLENDS,
			"normal",
		),
		space,
		origin,
		count: boundedCount(
			source,
			`${label}.count`,
			raw.count,
			VFX_MAX_RIBBONS_PER_PART,
			1,
		),
		segments: boundedCount(
			source,
			`${label}.segments`,
			raw.segments,
			VFX_MAX_RIBBON_SEGMENTS,
			8,
		),
		lifetime: positiveRange(
			source,
			`${label}.lifetime`,
			raw.lifetime,
		),
		length: positiveRange(source, `${label}.length`, raw.length),
		path: ribbonPath(source, `${label}.path`, raw.path),
		width: ribbonWidth(source, `${label}.width`, raw.width),
		pulse: ribbonPulse(source, `${label}.pulse`, raw.pulse),
		tracks: ribbonTracks(source, `${label}.tracks`, raw.tracks),
		wind: num(source, `${label}.wind`, raw.wind, 0),
		weather: weatherScaling(source, `${label}.weather`, raw.weather),
	};
};

/**
 * Parse one part, dispatching on `kind` before the key check so each kind
 * rejects the other's keys: a `collision` on a ribbon and a `segments` on an
 * emitter are both unknown keys, which is the structural half of "ribbons opt
 * out of particle concepts".
 */
const vfxPart = (
	source: string,
	label: string,
	value: unknown,
): VfxPart => {
	if (!isRecord(value)) {
		throw invalid(source, `${label} must be an object.`);
	}
	const kind = oneOf(
		source,
		`${label}.kind`,
		value.kind,
		PART_KINDS,
		"emitter",
	);
	return kind === "ribbon"
		? ribbonPart(source, label, value)
		: emitterPart(source, label, value);
};

const DEF_KEYS = ["id", "parts"] as const;

const vfxDef = (source: string, value: unknown): VfxDef => {
	const raw = record(source, "a def", value, DEF_KEYS);
	const id = text(source, "def id", raw.id);
	if (!Array.isArray(raw.parts) || raw.parts.length === 0) {
		throw invalid(source, `def "${id}" must list at least one part.`);
	}
	return {
		id,
		parts: raw.parts.map((part, index) =>
			vfxPart(source, `def "${id}" part ${index}`, part),
		),
	};
};

const assertBurstable = (
	source: string,
	defs: ReadonlyMap<string, VfxDef>,
): void => {
	for (const def of defs.values()) {
		for (const part of def.parts) {
			if (part.kind !== "emitter" || part.onDeath === null) {
				continue;
			}
			const target = defs.get(part.onDeath);
			if (!target) {
				throw invalid(
					source,
					`def "${def.id}" dies into unknown effect "${part.onDeath}". Known effects: ${[...defs.keys()].join(", ")}.`,
				);
			}
			if (
				!target.parts.some(
					(sub) => sub.kind === "emitter" && sub.burst > 0,
				)
			) {
				throw invalid(
					source,
					`def "${def.id}" dies into "${target.id}", which has no part with a burst, so it could never show anything.`,
				);
			}
		}
	}
};

/**
 * Every part — and every decal a part leaves behind, which draws on its own
 * `(layer, order)` so a smear can sit under the particles that made it — must
 * draw into one of the **allocated** render slots.
 *
 * The budget is spent — 4 of 4 — so counting distinct slots after the fact would
 * only report that the fifth one already exists. Checking each claimant against
 * the named allocation makes the exhaustion structural: one that is not on the
 * list fails at load, with the list and the two ways out in the message.
 */
const assertRenderSlots = (
	source: string,
	defs: ReadonlyMap<string, VfxDef>,
): void => {
	const check = (
		defId: string,
		what: string,
		layer: string,
		order: number,
	): void => {
		if (isAllocatedVfxSlot(layer, order)) {
			return;
		}
		throw invalid(
			source,
			`def "${defId}" draws ${what} into ${layer}#${order}, which is not an allocated VFX render slot. The allocation is full at ${VFX_MAX_RENDER_SLOTS} of ${VFX_MAX_RENDER_SLOTS}: ${describeVfxRenderSlots()}. Every slot owns a full-viewport render target every frame, so either draw into one of those and rely on submission order within it, or raise VFX_MAX_RENDER_SLOTS in engine/vfx/vfx-render-slots.ts with a measured VRAM and fill cost in hand.`,
		);
	};
	for (const def of defs.values()) {
		for (const part of def.parts) {
			check(def.id, "a part", part.layer, part.order);
			if (part.kind === "emitter" && part.decal) {
				check(def.id, "a decal", part.decal.layer, part.decal.order);
			}
		}
	}
};

/**
 * Validate an authored catalog into the shapes the VFX systems consume,
 * throwing on the first problem with the source named.
 *
 * Cross-def references are resolved here, so a dangling or unburstable
 * `onDeath` fails at load rather than the first time something dies, and the
 * catalog-wide render-slot budget is checked while every def is in hand.
 *
 * @example
 * const catalog = validateVfxCatalog([rainJson, splashJson], "src/game/content/vfx");
 */
export const validateVfxCatalog = (
	authored: ReadonlyArray<unknown>,
	source: string,
): VfxCatalog => {
	const defs = new Map<string, VfxDef>();
	for (const entry of authored) {
		const def = vfxDef(source, entry);
		if (defs.has(def.id)) {
			throw invalid(source, `def "${def.id}" is listed twice.`);
		}
		defs.set(def.id, def);
	}
	assertBurstable(source, defs);
	assertRenderSlots(source, defs);
	return { defs };
};
