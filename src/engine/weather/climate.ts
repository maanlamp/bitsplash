/**
 * The climate schema: what a weather catalog may say, and what it means once
 * validated.
 *
 * A **preset** is a mood — the target values the eased weather scalars chase. A
 * **climate** is a scheduling rulebook: which presets it may roll, how likely
 * each is, how long each lingers, and which one a fresh game starts in. Presets
 * live in one catalog-wide table and climates reference them by id, so a preset
 * id means exactly one thing everywhere (an override or an editor preview can
 * name a preset the active climate would never roll) and two climates cannot
 * disagree about what `storm` looks like.
 *
 * Validation happens once, at registration, in every build — see
 * {@link validateClimateCatalog}. Everything downstream consumes the validated
 * shapes, where `defaultPreset` is a resolved reference rather than an id and
 * `totalWeight` is known positive, so the dangling-reference and
 * division-by-zero cases are unrepresentable rather than merely unlikely.
 */

/** One authored preset row: a named mood with its target scalars. */
export type AuthoredClimatePreset = Readonly<{
	id: string;
	wind: number;
	precipitation: number;
	direction: number;
}>;

/** One authored scheduling row: a preset reference with its weight and dwell. */
export type AuthoredClimateEntry = Readonly<{
	preset: string;
	weight: number;
	dwellMin: number;
	dwellMax: number;
}>;

/** One authored climate: the presets it may roll plus where it starts. */
export type AuthoredClimate = Readonly<{
	id: string;
	defaultPreset: string;
	entries: readonly AuthoredClimateEntry[];
}>;

/**
 * The whole authored catalog — the shape of a `climates.json`.
 * `defaultClimateId` is required: a scene with no `SceneClimateComponent` (the
 * common case) resolves through it, so a catalog without one could not answer
 * the most frequent question asked of it.
 */
export type AuthoredClimateCatalog = Readonly<{
	defaultClimateId: string;
	presets: readonly AuthoredClimatePreset[];
	climates: readonly AuthoredClimate[];
}>;

/** A validated preset: the targets the eased scalars chase. */
export type ClimatePreset = Readonly<{
	/** Stable authored id, unique across the catalog. */
	id: string;
	/** Wind strength target, `0..1`. */
	wind: number;
	/** Precipitation target, `0..1`. */
	precipitation: number;
	/**
	 * Signed horizontal base direction, `-1..1` — negative blows left, positive
	 * right. Magnitude below one reads as a wind that is not committed to a
	 * heading; the gust envelope multiplies on top of it.
	 */
	direction: number;
}>;

/** A validated scheduling row: a resolved preset with its weight and dwell. */
export type ClimateEntry = Readonly<{
	preset: ClimatePreset;
	/** Relative likelihood of this row in a weighted roll. Non-negative. */
	weight: number;
	/** Shortest time (seconds) this row lingers once rolled. */
	dwellMin: number;
	/** Longest time (seconds) this row lingers once rolled. `>= dwellMin`. */
	dwellMax: number;
}>;

/** A validated climate. */
export type Climate = Readonly<{
	id: string;
	entries: readonly ClimateEntry[];
	/** Where a fresh game in this climate starts. Always one of `entries`. */
	defaultPreset: ClimatePreset;
	/** Sum of every entry weight. Validation guarantees this is positive. */
	totalWeight: number;
}>;

/** A validated catalog, ready for the registry. */
export type ClimateCatalog = Readonly<{
	presets: ReadonlyMap<string, ClimatePreset>;
	climates: ReadonlyMap<string, Climate>;
	/** The climate a scene with no authored climate id resolves to. */
	defaultClimate: Climate;
}>;

/**
 * A partial set of weather targets: every `null` field defers to the layer
 * below. Both a `WeatherOverrideComponent` and an editor preview are read
 * through this shape, so the layering rule is written once.
 *
 * A non-null `presetId` supplies all three scalars; explicit scalars then win
 * over whatever the preset said, so "the storm, but blowing the other way" is
 * authorable without a new preset.
 */
export type WeatherRequest = Readonly<{
	presetId: string | null;
	wind: number | null;
	precipitation: number | null;
	direction: number | null;
}>;

/** Calm, still, blowing right — what a world with no weather at all reads as. */
export const CALM_PRESET: ClimatePreset = {
	id: "calm",
	wind: 0,
	precipitation: 0,
	direction: 1,
};

const invalid = (source: string, message: string): Error =>
	new Error(`${source}: ${message}`);

const unitScalar = (
	source: string,
	label: string,
	value: number,
): number => {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw invalid(
			source,
			`${label} is ${value}; weather scalars are normalized to 0..1.`,
		);
	}
	return value;
};

const validatePresets = (
	source: string,
	authored: readonly AuthoredClimatePreset[],
): Map<string, ClimatePreset> => {
	if (authored.length === 0) {
		throw invalid(
			source,
			"lists no presets, so no climate could ever roll one.",
		);
	}
	const presets = new Map<string, ClimatePreset>();
	for (const row of authored) {
		if (row.id.length === 0) {
			throw invalid(source, "a preset has an empty id.");
		}
		if (presets.has(row.id)) {
			throw invalid(source, `preset "${row.id}" is listed twice.`);
		}
		if (
			!Number.isFinite(row.direction) ||
			row.direction < -1 ||
			row.direction > 1
		) {
			throw invalid(
				source,
				`preset "${row.id}" has direction ${row.direction}; a base direction is a signed unit scalar in -1..1.`,
			);
		}
		presets.set(row.id, {
			id: row.id,
			wind: unitScalar(source, `preset "${row.id}" wind`, row.wind),
			precipitation: unitScalar(
				source,
				`preset "${row.id}" precipitation`,
				row.precipitation,
			),
			direction: row.direction,
		});
	}
	return presets;
};

const validateEntries = (
	source: string,
	climate: AuthoredClimate,
	presets: ReadonlyMap<string, ClimatePreset>,
): readonly ClimateEntry[] => {
	if (climate.entries.length === 0) {
		throw invalid(
			source,
			`climate "${climate.id}" lists no presets, so it could never schedule anything.`,
		);
	}
	const seen = new Set<string>();
	return climate.entries.map((row): ClimateEntry => {
		const preset = presets.get(row.preset);
		if (!preset) {
			throw invalid(
				source,
				`climate "${climate.id}" references unknown preset "${row.preset}".`,
			);
		}
		if (seen.has(row.preset)) {
			throw invalid(
				source,
				`climate "${climate.id}" lists preset "${row.preset}" twice; give it one row with the combined weight.`,
			);
		}
		seen.add(row.preset);
		if (!Number.isFinite(row.weight) || row.weight < 0) {
			throw invalid(
				source,
				`climate "${climate.id}" gives preset "${row.preset}" weight ${row.weight}; weights are non-negative.`,
			);
		}
		if (
			!Number.isFinite(row.dwellMin) ||
			!Number.isFinite(row.dwellMax) ||
			row.dwellMin < 0 ||
			row.dwellMax < row.dwellMin
		) {
			throw invalid(
				source,
				`climate "${climate.id}" gives preset "${row.preset}" a dwell range of ${row.dwellMin}..${row.dwellMax}s; a range is non-negative with min <= max.`,
			);
		}
		return {
			preset,
			weight: row.weight,
			dwellMin: row.dwellMin,
			dwellMax: row.dwellMax,
		};
	});
};

const validateClimate = (
	source: string,
	authored: AuthoredClimate,
	presets: ReadonlyMap<string, ClimatePreset>,
): Climate => {
	if (authored.id.length === 0) {
		throw invalid(source, "a climate has an empty id.");
	}
	const entries = validateEntries(source, authored, presets);
	const totalWeight = entries.reduce(
		(sum, entry) => sum + entry.weight,
		0,
	);
	if (totalWeight <= 0) {
		throw invalid(
			source,
			`climate "${authored.id}" has zero total weight, so a weighted roll could never pick anything.`,
		);
	}
	const defaultPreset = entries.find(
		(entry) => entry.preset.id === authored.defaultPreset,
	)?.preset;
	if (!defaultPreset) {
		throw invalid(
			source,
			`climate "${authored.id}" defaults to preset "${authored.defaultPreset}", which it does not list.`,
		);
	}
	return { id: authored.id, entries, defaultPreset, totalWeight };
};

/**
 * Validate an authored catalog into the shapes the rest of the engine consumes,
 * throwing on the first problem with the source named. Called from
 * `registerClimateCatalog` in every build — authored weather is small and a
 * broken catalog is a content bug worth crashing on, not degrading over.
 *
 * @example
 * const catalog = validateClimateCatalog(json, "src/game/content/weather/climates.json");
 */
export const validateClimateCatalog = (
	authored: AuthoredClimateCatalog,
	source: string,
): ClimateCatalog => {
	const presets = validatePresets(source, authored.presets);
	if (authored.climates.length === 0) {
		throw invalid(
			source,
			"lists no climates. Weather-off is expressed by not registering a catalog at all, not by registering an empty one.",
		);
	}
	const climates = new Map<string, Climate>();
	for (const row of authored.climates) {
		if (climates.has(row.id)) {
			throw invalid(source, `climate "${row.id}" is listed twice.`);
		}
		climates.set(row.id, validateClimate(source, row, presets));
	}
	const defaultClimate = climates.get(authored.defaultClimateId);
	if (!defaultClimate) {
		throw invalid(
			source,
			`defaultClimateId is "${authored.defaultClimateId}", which is not a listed climate.`,
		);
	}
	return { presets, climates, defaultClimate };
};
