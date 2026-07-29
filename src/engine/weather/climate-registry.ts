import {
	type AuthoredClimateCatalog,
	type Climate,
	type ClimateCatalog,
	type ClimatePreset,
	validateClimateCatalog,
} from "./climate";

/**
 * The engine's single climate catalog.
 *
 * Weather is engine functionality but climates are authored *content*, so the
 * game registers its catalog as a load-time side effect and the engine — and the
 * editor, through the same import order — reads it back from here. Scene loading
 * never sees a `GameModule`, which is why this is a module registry rather than a
 * service.
 *
 * No catalog registered is a supported, documented state: weather is disabled,
 * {@link hasClimates} is `false`, and every weather system no-ops so
 * engine-only tests and bare worlds keep booting.
 */
let catalog: ClimateCatalog | null = null;

/**
 * Validate and install the catalog. Throws with the source named on any content
 * problem — an empty preset table, a dangling preset reference, all-zero
 * weights, a default that is not listed, a degenerate dwell range.
 *
 * Installing replaces whatever was registered before. The shipped game calls
 * this exactly once from `game/registrations.ts`; tests install fixture catalogs
 * by calling it again and hand the world back to weather-off with
 * {@link clearClimateCatalog}.
 *
 * @example
 * registerClimateCatalog(climatesJson, "src/game/content/weather/climates.json");
 */
export const registerClimateCatalog = (
	authored: AuthoredClimateCatalog,
	source: string,
): void => {
	catalog = validateClimateCatalog(authored, source);
};

/** Return to the weather-disabled state. Test hygiene; nothing ships calling it. */
export const clearClimateCatalog = (): void => {
	catalog = null;
};

/**
 * Whether any climate is registered. `false` means weather is disabled — the
 * scheduler creates no run-state, wind samples calm, and precipitation reads
 * zero.
 */
export const hasClimates = (): boolean => catalog !== null;

const required = (): ClimateCatalog => {
	if (!catalog) {
		throw new Error(
			"Weather: no climate catalog is registered. Guard weather work with hasClimates(), or register a catalog (see game/registrations.ts).",
		);
	}
	return catalog;
};

/**
 * The climate an authored id names, or the catalog default for `null`.
 *
 * A dangling id throws rather than falling back: the id came from authored scene
 * data, so silently substituting the default would hide a renamed climate behind
 * plausible-looking weather. The throw lands on the first resolve — scene entry
 * or the first frame after it.
 *
 * @example
 * const climate = resolveClimate(ecs.query(SceneClimateComponent)[0]?.[1].climateId ?? null);
 */
export const resolveClimate = (id: string | null): Climate => {
	const current = required();
	if (id === null) {
		return current.defaultClimate;
	}
	const climate = current.climates.get(id);
	if (!climate) {
		throw new Error(
			`Weather: scene climate "${id}" is not in the registered catalog. Known climates: ${[...current.climates.keys()].join(", ")}.`,
		);
	}
	return climate;
};

/**
 * The preset a id names, from the catalog-wide table rather than any one
 * climate's roll list — which is what lets an override or an editor preview
 * reach a preset the active climate would never schedule. A miss throws.
 */
export const resolvePreset = (id: string): ClimatePreset => {
	const current = required();
	const preset = current.presets.get(id);
	if (!preset) {
		throw new Error(
			`Weather: preset "${id}" is not in the registered catalog. Known presets: ${[...current.presets.keys()].join(", ")}.`,
		);
	}
	return preset;
};

/** Every registered climate id, for authoring surfaces. Empty when weather is off. */
export const climateIds = (): readonly string[] =>
	catalog ? [...catalog.climates.keys()] : [];

/**
 * Every registered preset, for authoring surfaces — the editor's preview picker
 * offers the whole table, including presets no climate rolls.
 */
export const climatePresets = (): readonly ClimatePreset[] =>
	catalog ? [...catalog.presets.values()] : [];

/** The catalog's default climate id, or `null` when weather is off. */
export const defaultClimateId = (): string | null =>
	catalog?.defaultClimate.id ?? null;
