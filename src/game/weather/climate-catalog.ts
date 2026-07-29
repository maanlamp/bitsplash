import type { AuthoredClimateCatalog } from "../../engine/weather/climate";
import { registerClimateCatalog } from "../../engine/weather/climate-registry";
import climatesJson from "../content/weather/climates.json";
import {
	CLIMATE_IDS,
	DEFAULT_CLIMATE_ID,
	WEATHER_PRESET_IDS,
} from "./climate-ids";

/**
 * Registers the game's climate catalog with the engine.
 *
 * A static JSON import rather than `import.meta.glob`: the catalog must load
 * identically under Vite and under `bun test`, where `import.meta.glob` throws,
 * and there is exactly one catalog so there is nothing to glob for.
 *
 * The engine validates the catalog's internal consistency. What is checked here is
 * the other direction — that the JSON and the `const` id tuples say the same
 * thing — so a preset renamed in one place and not the other fails at load rather
 * than surviving as a reference to nothing.
 */
const SOURCE = "src/game/content/weather/climates.json";

const catalog = climatesJson as AuthoredClimateCatalog;

const disagreement = (
	label: string,
	authored: readonly string[],
	declared: readonly string[],
): string | null => {
	const missing = declared.filter((id) => !authored.includes(id));
	const extra = authored.filter((id) => !declared.includes(id));
	if (missing.length === 0 && extra.length === 0) {
		return null;
	}
	return `${label} disagree with the id tuple — absent from the JSON: [${missing.join(", ")}]; absent from the tuple: [${extra.join(", ")}].`;
};

/**
 * Validate the catalog against the shipped id tuples and install it. Idempotent
 * and safe to call again — tests that swap in a fixture catalog use it to put the
 * real one back.
 */
export const registerClimateContent = (): void => {
	const problem =
		disagreement(
			"presets",
			catalog.presets.map((preset) => preset.id),
			WEATHER_PRESET_IDS,
		) ??
		disagreement(
			"climates",
			catalog.climates.map((climate) => climate.id),
			CLIMATE_IDS,
		) ??
		(catalog.defaultClimateId === DEFAULT_CLIMATE_ID
			? null
			: `defaultClimateId is "${catalog.defaultClimateId}" but DEFAULT_CLIMATE_ID is "${DEFAULT_CLIMATE_ID}".`);
	if (problem !== null) {
		throw new Error(`${SOURCE}: ${problem}`);
	}
	registerClimateCatalog(catalog, SOURCE);
};

registerClimateContent();
