import {
	serializable,
	serialize,
} from "../serialization/serializable";

/**
 * Authored, optional per-scene weather singleton.
 *
 * A scene carries only which climate applies and whether it reads as an
 * interior. Everything else about the weather — the current preset, the eased
 * scalars, the wind direction — is global run-state, so a scene file never
 * pins a moment of weather.
 *
 * Absence of this component is meaningful and is the common case: no component
 * means the catalog's default climate, outdoors.
 *
 * @example
 * ```ts
 * const climate = ecs.queryFirst(SceneClimateComponent)?.[1];
 * const resolved = resolveClimate(climate?.climateId ?? null);
 * ```
 */
@serializable("SceneClimate")
export class SceneClimateComponent {
	/**
	 * Id of the climate this scene is scheduled against, or `null` to inherit
	 * the catalog's default. Resolved live on every read — nothing is ever
	 * materialized into the scene file, so retargeting the default climate
	 * moves every inheriting scene with it. A dangling id throws on resolve.
	 */
	@serialize() climateId: string | null = null;

	/**
	 * Whether this scene reads as an interior.
	 *
	 * Indoors inherits the current climate and keeps global weather ticking —
	 * the storm outside honestly moves on — but suppresses the visual
	 * presentation (particles stop, foliage stills) and muffles the audio
	 * rather than silencing it.
	 */
	@serialize() indoor = false;
}
