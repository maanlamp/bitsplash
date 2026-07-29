import type { ReadonlyECS } from "../ecs";
import type { WeatherRequest } from "./climate";

/**
 * The editor's weather preview: a per-world scrub that sits above every other
 * weather authority.
 *
 * It is a module `WeakMap` keyed by the ECS, and that is the whole point. Edit-mode
 * preview cannot be an entity: `SceneDocument.save` replays the edit journal into
 * a scratch world and diffs it against the live edit world serialized whole, then
 * hard-crashes on any drift. A preview component would either journal a scrub as
 * an authored edit or trip the diff. Stored here it is invisible to the journal,
 * to both save tripwires, and to every snapshot — non-serialized by construction
 * rather than by a filter someone must remember.
 *
 * Scrubbing therefore never writes a component, and closing the editor never
 * leaves preview weather baked into a scene file.
 */
const previews = new WeakMap<ReadonlyECS, WeatherRequest>();

/**
 * Install (or clear, with `null`) a world's preview weather. Fields left `null`
 * fall through to the live override, then to the scheduler.
 *
 * @example
 * setWeatherPreview(view.scene.world.ecs, { presetId: "storm", wind: null, precipitation: null, direction: null });
 * setWeatherPreview(view.scene.world.ecs, null); // back to the climate default
 */
export const setWeatherPreview = (
	ecs: ReadonlyECS,
	preview: WeatherRequest | null,
): void => {
	if (preview === null) {
		previews.delete(ecs);
		return;
	}
	previews.set(ecs, preview);
};

/** A world's preview weather, or `null` when nothing is being scrubbed. */
export const weatherPreview = (
	ecs: ReadonlyECS,
): WeatherRequest | null => previews.get(ecs) ?? null;
