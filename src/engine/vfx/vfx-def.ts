import { Ease } from "../animation/ease";
import {
	keyframe,
	type Keyframe,
	KeyframesColor,
	KeyframesNumber,
} from "../animation/keyframes";
import { type QuadBlend, QUAD_BLENDS } from "../render/blend";
import { ColorResolver } from "../render/color-resolver";
import type { SerializableValue } from "../serialization/serializable-value";

/**
 * The VFX effect schema: what an authored `*.vfx.json` may say, and what it
 * means once validated.
 *
 * An **effect** is a list of **parts**, so one def expresses a composite (a
 * beam plus its motes, flames plus smoke) without any notion of nesting. Only
 * particle-emitter parts exist today; `kind` is the discriminant that lets
 * beam-quad parts join later without reshaping anything.
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
 * **Deliberately absent** (the schema is shaped to grow into them, none is
 * implemented): beam-quad parts, flipbook frame metadata, decal specs, and a
 * `"raycast"` collision mode.
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
 * - `rain-blocking` — the rain-blocking classification
 *   (`rainBlockingLayers`), so a tarpaulin marked `"blocks"` stops drops it
 *   never stopped the player with and a grate marked `"passes"` lets them fall
 *   through. Declaring it also marks the part **as precipitation**: its
 *   particles are confined to sky-reached columns via `rainHeightAt`, so
 *   nothing spawns or drifts under an overhang.
 */
export type VfxCollisionCells = (typeof VFX_COLLISION_CELLS)[number];

/**
 * How a particle interacts with the world.
 *
 * `tiles` tests the particle's cell against a merged tile set — cheap, and
 * enough for rain, splashes, and settling leaves — chosen by {@link cells}.
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

/**
 * How much the live weather scales this part's emission rate, per frame.
 *
 * Each factor is an **influence** in `0..1` interpolating between "ignore the
 * weather" (`0`, factor stays one) and "track it exactly" (`1`, factor becomes
 * the weather scalar itself), and the two multiply. Rain therefore authors
 * `precipitation: 1` and stops dead in clear weather; blood authors nothing and
 * never notices the sky. The scalars read are the **indoor-masked** visible
 * ones, so an indoor scene stills every weather-driven emitter for free.
 */
export type VfxWeatherScaling = Readonly<{
	precipitation: number;
	wind: number;
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
	/** Def id burst at a particle's death position, or `null`. */
	onDeath: string | null;
	tracks: VfxTracks;
	/**
	 * Pool size, derived from rate, lifetime, and burst — never authored, so a
	 * hand-typed capacity can never be too small for the emission it must hold.
	 */
	capacity: number;
}>;

/** A validated part. Beam-quad parts widen this union when they land. */
export type VfxPart = VfxEmitterPart;

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
export const VFX_MAX_PARTICLES_PER_PART = 8192;

/**
 * Ceiling on the number of distinct `(layer, order)` slots a whole catalog may
 * draw into. Every distinct slot owns a full-viewport render target — one
 * clear, one full-screen blit, and `width * height * 4` bytes of VRAM every
 * frame — so effects share slots and rely on submission order within them.
 */
export const VFX_MAX_RENDER_SLOTS = 4;

const colors = new ColorResolver();

/** The bezier presets an authored `ease` may name, keyed by their own labels. */
const EASE_PRESETS: ReadonlyMap<string, Ease> = new Map(
	[
		Ease.Linear,
		Ease.InQuad,
		Ease.OutQuad,
		Ease.InOutQuad,
		Ease.InCubic,
		Ease.OutCubic,
		Ease.InOutCubic,
		Ease.InBack,
		Ease.OutBack,
		Ease.InOutBack,
	].map((preset) => [preset.label, preset]),
);

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
		const preset = EASE_PRESETS.get(value);
		if (!preset) {
			throw invalid(
				source,
				`${label} names ease "${value}", which is not a preset. Known presets: ${[...EASE_PRESETS.keys()].join(", ")}; or give four bezier control floats.`,
			);
		}
		return preset;
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

const COLLISION_KEYS = [
	"mode",
	"cells",
	"response",
	"restChance",
] as const;
const COLLISION_MODES = ["none", "tiles"] as const;

const collision = (
	source: string,
	label: string,
	value: unknown,
): VfxCollision => {
	if (value === undefined) {
		return { mode: "none" };
	}
	const raw = record(source, label, value, COLLISION_KEYS);
	const mode = oneOf(
		source,
		`${label}.mode`,
		raw.mode,
		COLLISION_MODES,
		"none",
	);
	if (mode === "none") {
		return { mode: "none" };
	}
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

const WEATHER_KEYS = ["precipitation", "wind"] as const;

const weatherScaling = (
	source: string,
	label: string,
	value: unknown,
): VfxWeatherScaling => {
	if (value === undefined) {
		return { precipitation: 0, wind: 0 };
	}
	const raw = record(source, label, value, WEATHER_KEYS);
	return {
		precipitation: unit(
			source,
			`${label}.precipitation`,
			raw.precipitation,
			0,
		),
		wind: unit(source, `${label}.wind`, raw.wind, 0),
	};
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

const ZERO_RANGE: VfxRange = { min: 0, max: 0 };

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
	"onDeath",
	"tracks",
] as const;

const PART_KINDS = ["emitter"] as const;

const emitterPart = (
	source: string,
	label: string,
	value: unknown,
): VfxEmitterPart => {
	const raw = record(source, label, value, PART_KEYS);
	oneOf(source, `${label}.kind`, raw.kind, PART_KINDS, "emitter");
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
	const order = Math.round(
		num(source, `${label}.order`, raw.order, 0),
	);
	if (order < 0 || order > 999) {
		throw invalid(
			source,
			`${label}.order is ${order}; a within-layer order is 0..999.`,
		);
	}
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
		collision: collision(source, `${label}.collision`, raw.collision),
		onDeath:
			raw.onDeath === undefined || raw.onDeath === null
				? null
				: text(source, `${label}.onDeath`, raw.onDeath),
		tracks: tracks(source, `${label}.tracks`, raw.tracks),
		capacity: capacityFor(source, label, rate, burst, lifetime.max),
	};
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
			emitterPart(source, `def "${id}" part ${index}`, part),
		),
	};
};

const assertBurstable = (
	source: string,
	defs: ReadonlyMap<string, VfxDef>,
): void => {
	for (const def of defs.values()) {
		for (const part of def.parts) {
			if (part.onDeath === null) {
				continue;
			}
			const target = defs.get(part.onDeath);
			if (!target) {
				throw invalid(
					source,
					`def "${def.id}" dies into unknown effect "${part.onDeath}". Known effects: ${[...defs.keys()].join(", ")}.`,
				);
			}
			if (!target.parts.some((sub) => sub.burst > 0)) {
				throw invalid(
					source,
					`def "${def.id}" dies into "${target.id}", which has no part with a burst, so it could never show anything.`,
				);
			}
		}
	}
};

const assertRenderSlots = (
	source: string,
	defs: ReadonlyMap<string, VfxDef>,
): void => {
	const slots = new Set<string>();
	for (const def of defs.values()) {
		for (const part of def.parts) {
			slots.add(`${part.layer}#${part.order}`);
		}
	}
	if (slots.size > VFX_MAX_RENDER_SLOTS) {
		throw invalid(
			source,
			`the catalog draws into ${slots.size} distinct (layer, order) slots (${[...slots].join(", ")}), past the ${VFX_MAX_RENDER_SLOTS} ceiling. Every slot owns a full-viewport render target every frame; share slots and rely on submission order within them.`,
		);
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
