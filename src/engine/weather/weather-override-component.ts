import type { EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type PartialWeatherChannels,
	WEATHER_CHANNELS,
	type WeatherChannel,
} from "./channels";
import type { WeatherRequest } from "./climate";

/**
 * A director's escape from the climate: while an entity carrying this exists, the
 * eased weather scalars chase its targets instead of the scheduler's.
 *
 * Overrides supply *targets*, never values, so arming and despawning one ramps
 * like any other transition — the single eased state is still the only thing
 * consumers read, and there are no hard cuts. What an override does **not**
 * escape is presentation: indoor suppression still applies, because the director
 * wants the storm heard through the walls, not painted inside them.
 *
 * Deliberately **not** `PersistentComponent`-tagged. Cutscenes are scene-scoped,
 * so an override dies with its scene by construction rather than by anybody
 * remembering to clean it up.
 *
 * Ownership is the other half of that guarantee. Set {@link owner} to the
 * sequence entity that spawned the override and `WeatherSchedulerSystem` destroys
 * it as soon as that entity is gone — the camera-borrow pattern. Polling for a
 * dead owner is the only release path that covers all four endings at once: a
 * sequence that finished, one that was skipped, one whose queued definition
 * rolled over onto a reused entity, and one destroyed outright. An owning
 * workstream may still despawn explicitly for promptness; it may not rely on
 * having done so.
 *
 * @example
 * const override = new WeatherOverrideComponent();
 * override.presetId = "storm";
 * override.priority = 10;
 * override.owner = ctx.entityId;
 * ecs.createEntity([override]);
 */
@serializable("WeatherOverride")
export class WeatherOverrideComponent implements Record<
	WeatherChannel,
	number | null
> {
	/**
	 * Preset whose targets this override imposes, resolved from the catalog-wide
	 * table so it may name a preset the active climate never rolls. `null` means
	 * the override only adjusts the scalars below.
	 */
	@serialize() presetId: string | null = null;

	/** Explicit wind target `0..1`, winning over {@link presetId}. `null` defers. */
	@serialize() wind: number | null = null;

	/** Explicit rain target `0..1`, winning over {@link presetId}. `null` defers. */
	@serialize() rain: number | null = null;

	/** Explicit snow target `0..1`, winning over {@link presetId}. `null` defers. */
	@serialize() snow: number | null = null;

	/** Explicit sand target `0..1`, winning over {@link presetId}. `null` defers. */
	@serialize() sand: number | null = null;

	/** Explicit signed base direction `-1..1`, winning over {@link presetId}. */
	@serialize() direction: number | null = null;

	/**
	 * Highest priority wins. Ties break on entity id, lexicographically greatest
	 * first: arbitrary but total, and identical before and after a save — which is
	 * what matters, since entity ids are random UUIDs and carry no spawn order to
	 * prefer instead. Author distinct priorities when the winner matters.
	 */
	@serialize() priority = 0;

	/**
	 * Entity whose life this override is tied to, usually the sequence entity that
	 * spawned it. `null` means an authored override that lives as long as its
	 * scene; anything else is reclaimed the moment that entity stops existing.
	 */
	@serialize() owner: EntityId | null = null;
}

/**
 * The {@link WeatherRequest} an override imposes. Channels left `null` are absent
 * from the request, which is how they fall through to the layer below instead of
 * zeroing.
 *
 * @example
 * const targets = applyRequest(base, overrideRequest(override));
 */
export const overrideRequest = (
	override: WeatherOverrideComponent,
): WeatherRequest => {
	const precipitation: Partial<Record<WeatherChannel, number>> = {};
	for (const channel of WEATHER_CHANNELS) {
		const value = override[channel];
		if (value !== null) {
			precipitation[channel] = value;
		}
	}
	return {
		presetId: override.presetId,
		wind: override.wind,
		precipitation: hasAny(precipitation) ? precipitation : null,
		direction: override.direction,
	};
};

const hasAny = (channels: PartialWeatherChannels): boolean =>
	WEATHER_CHANNELS.some((channel) => channels[channel] !== undefined);
