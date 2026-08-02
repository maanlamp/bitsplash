/**
 * The precipitation channels weather is made of, and the record every consumer
 * reads them through.
 *
 * Precipitation is not one number. "How snowed-on is this entity" is a different
 * question from "how rained-on", and a single scalar cannot answer both — so the
 * eased weather carries one `0..1` blend weight per channel and consumers ask for
 * the one they care about. Wind is a **peer scalar**, not a channel: it is not
 * something falling out of the sky, it has a direction, and everything reads it
 * whole.
 *
 * The tuple is the type-safe cross-reference, following `CLIMATE_IDS`: a channel
 * is reached through {@link WEATHER_CHANNELS} or the {@link WeatherChannel} union
 * `tsc` derives from it, never as a bare string literal at a call site.
 *
 * A preset that omits a channel contributes zero to it, so a climate that rolls
 * from `drizzle` to a snowfall crossfades rain out as snow comes in by
 * construction — nobody has to author the zero.
 */

export const WEATHER_CHANNELS = ["rain", "snow", "sand"] as const;

export type WeatherChannel = (typeof WEATHER_CHANNELS)[number];

/** Every channel present; a preset that omits one contributes zero. */
export type WeatherChannels = Readonly<
	Record<WeatherChannel, number>
>;

/** An authored or partial channel set: an absent channel means zero. */
export type PartialWeatherChannels = Readonly<
	Partial<Record<WeatherChannel, number>>
>;

/**
 * Build a full channel record from a function of the channel. Every other
 * constructor here goes through it, so adding a channel to
 * {@link WEATHER_CHANNELS} extends them all at once.
 *
 * @example
 * const eased = weatherChannels((c) => approach(state[c], target[c], dt, tau));
 */
export const weatherChannels = (
	value: (channel: WeatherChannel) => number,
): WeatherChannels =>
	Object.fromEntries(
		WEATHER_CHANNELS.map((channel) => [channel, value(channel)]),
	) as unknown as WeatherChannels;

/** No precipitation of any kind. */
export const NO_CHANNELS: WeatherChannels = Object.freeze(
	weatherChannels(() => 0),
);

/** Resolve an authored partial set into a full one, absent meaning zero. */
export const resolveChannels = (
	partial: PartialWeatherChannels,
): WeatherChannels =>
	weatherChannels((channel) => partial[channel] ?? 0);
