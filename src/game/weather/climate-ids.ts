/**
 * Every climate and weather preset the game ships, as `const` tuples.
 *
 * These are the type-safe handles for cross-referencing weather from TypeScript —
 * a sequence naming a preset, a test naming a climate, an editor default. The
 * catalog JSON is the *data*; these tuples are what `tsc` can check, and
 * `climate-catalog.ts` cross-checks the two at load so a rename that touches only
 * one side fails loudly instead of leaving a dangling reference.
 *
 * @example
 * const override = new WeatherOverrideComponent();
 * override.presetId = WEATHER_PRESET_IDS[4]; // "storm", checked by tsc
 */

/** Preset ids in `src/game/content/weather/climates.json`, in authored order. */
export const WEATHER_PRESET_IDS = [
	"calm",
	"breezy",
	"blustery",
	"drizzle",
	"storm",
	"blizzard",
	"sandstorm",
] as const;

export type WeatherPresetId = (typeof WEATHER_PRESET_IDS)[number];

/** Climate ids in `src/game/content/weather/climates.json`, in authored order. */
export const CLIMATE_IDS = [
	"temperate",
	"storm-coast",
	"alpine",
	"desert",
] as const;

export type ClimateId = (typeof CLIMATE_IDS)[number];

/** The climate a scene with no authored `SceneClimateComponent` inherits. */
export const DEFAULT_CLIMATE_ID: ClimateId = "temperate";
