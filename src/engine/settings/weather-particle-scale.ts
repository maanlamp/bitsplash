import {
	PlayerSettings,
	playerSettings,
	type WeatherQuality,
} from "./player-settings";

/**
 * The player's two weather-cost dials, resolved into the one number an emitter
 * multiplies its emission by.
 *
 * Both are published contracts of `PlayerSettings` and both mean "spawn less":
 * {@link PlayerSettings.weatherQuality} is the frame-cost release valve the
 * weather effect defs are tuned against, and
 * {@link PlayerSettings.weatherDensity} is the accessibility control on top of
 * it. They multiply, and `high` × `1` is the authored amount — nothing here can
 * ever ask for *more* than the def authored.
 *
 * It is applied at the emitter, to weather-driven parts only, so blood and fire
 * never notice a weather setting. See `VfxUpdateSystem`.
 */

/**
 * Share of the authored spawn rate each quality asks for.
 *
 * `high` is unity by definition. The two reductions are the release valve the
 * WS-G retune measured against: `medium` roughly halves the particle work and
 * `low` roughly quarters it, both without touching the effect defs, so a player
 * on a slow machine gets the same weather thinner rather than a different one.
 */
const QUALITY_SCALE: Readonly<Record<WeatherQuality, number>> = {
	low: 0.3,
	medium: 0.6,
	high: 1,
};

/**
 * Emission multiplier for a weather-driven part, `0..1`.
 *
 * @example
 * const rate = part.rate * rateScale * influence * weatherParticleScale();
 */
export const weatherParticleScale = (
	settings: PlayerSettings = playerSettings,
): number =>
	QUALITY_SCALE[settings.weatherQuality] * settings.weatherDensity;
