import type { AudioCategory } from "../audio/audio-bus";
import { LocalStorageSettingsStore } from "../input/local-storage-settings-store";
import { clamp01 } from "../noise";
import type { SettingsStore } from "../input/settings-store";
import { Subscribable } from "../subscribable";

/**
 * How much weather the renderer is asked for. Ordered least to most expensive,
 * and reached through this tuple rather than by a bare string literal.
 */
export const WEATHER_QUALITIES = ["low", "medium", "high"] as const;

export type WeatherQuality = (typeof WEATHER_QUALITIES)[number];

const isWeatherQuality = (value: string): value is WeatherQuality =>
	(WEATHER_QUALITIES as readonly string[]).includes(value);

const KEY = {
	master: "audio.master",
	ambience: "audio.ambience",
	sfx: "audio.sfx",
	voice: "audio.voice",
	flashIntensity: "a11y.flashIntensity",
	cameraShake: "a11y.cameraShake",
	screenFades: "a11y.screenFades",
	weatherDensity: "a11y.weatherDensity",
	weatherQuality: "video.weatherQuality",
	accessibilitySeen: "a11y.seen",
} as const;

/**
 * Every default but one is `1` — full volume, full shake, fades on, full
 * weather — because accessibility options are opt-in reductions and the game
 * should look its best until the player says otherwise. `accessibilitySeen`
 * starts at `0`: nobody has walked the first-launch pass yet.
 */
const DEFAULTS: Readonly<Record<string, number>> = {
	[KEY.accessibilitySeen]: 0,
};

const defaultOf = (key: string): number => DEFAULTS[key] ?? 1;

/**
 * Player-facing settings, persisted and shared process-wide.
 *
 * Volumes are **positions**, `0..1`, not gains: the perceptual curve lives in
 * `volumeGain` so a slider and the mixer cannot disagree about what 50% means.
 * Everything here is validated only against the invalid domain (non-finite,
 * negative); there are no arbitrary floors or caps.
 *
 * Defaults favour the better-looking game — a player who wants less turns it
 * down, rather than having to discover what was withheld.
 *
 * @example
 * playerSettings.setVolume("ambience", 0.4);
 * playerSettings.subscribe(() => applyVolumeSettings(audio));
 */
export class PlayerSettings extends Subscribable {
	private readonly values = new Map<string, number>();
	private quality: WeatherQuality;

	constructor(
		private readonly store: SettingsStore = new LocalStorageSettingsStore(),
	) {
		super();
		for (const key of Object.values(KEY)) {
			if (key !== KEY.weatherQuality) {
				this.values.set(key, this.readNumber(key, defaultOf(key)));
			}
		}
		const raw = store.get(KEY.weatherQuality);
		this.quality =
			raw !== null && isWeatherQuality(raw) ? raw : "high";
	}

	/** Master volume position, `0..1`. */
	get masterVolume(): number {
		return this.values.get(KEY.master)!;
	}

	setMasterVolume(position: number): void {
		this.writeNumber(KEY.master, position);
	}

	/** One category's volume position, `0..1`. */
	volume(category: AudioCategory): number {
		return this.values.get(KEY[category])!;
	}

	setVolume(category: AudioCategory, position: number): void {
		this.writeNumber(KEY[category], position);
	}

	/**
	 * How bright a lightning flash is allowed to be, as a fraction `0..1` of the
	 * photosensitivity envelope — **not** an alpha and not a multiplier on one.
	 *
	 * A published contract: the lightning flash reads this and turns it into an
	 * alpha through `flashAlpha`, which is the only conversion and is what keeps
	 * the result inside `FLASH_ENVELOPE`. `1` is the brightest flash the
	 * envelope permits, which is the default; `0` means no flash at all. The
	 * per-second cap, the area cap and the fades are not settings and are not
	 * reachable from here.
	 *
	 * Writes are clamped to `0..1`. That is the value's domain rather than an
	 * arbitrary range: a larger number does not mean a brighter flash, it means
	 * a number the envelope will discard.
	 */
	get flashIntensity(): number {
		return this.values.get(KEY.flashIntensity)!;
	}

	setFlashIntensity(amount: number): void {
		this.writeNumber(KEY.flashIntensity, clamp01(amount));
	}

	/** Camera shake scale, `0..1`. */
	get cameraShake(): number {
		return this.values.get(KEY.cameraShake)!;
	}

	setCameraShake(amount: number): void {
		this.writeNumber(KEY.cameraShake, amount);
	}

	/** Whether full-screen fades play at all. */
	get screenFades(): boolean {
		return this.values.get(KEY.screenFades)! > 0;
	}

	setScreenFades(enabled: boolean): void {
		this.writeNumber(KEY.screenFades, enabled ? 1 : 0);
	}

	/**
	 * Weather particle density scale, `0..1`, applied on top of whatever
	 * {@link weatherQuality} already asks for.
	 *
	 * A published contract: emitters multiply their spawn rate by this. It is an
	 * accessibility control — fewer things moving on screen — so `1`, the
	 * default, is the authored amount and nothing reads it as a licence to spawn
	 * more.
	 */
	get weatherDensity(): number {
		return this.values.get(KEY.weatherDensity)!;
	}

	setWeatherDensity(amount: number): void {
		this.writeNumber(KEY.weatherDensity, amount);
	}

	/**
	 * How much weather the renderer is asked for.
	 *
	 * A published contract: it is the release valve for frame cost, honoured at
	 * the emitter. Defaults to `"high"` — a player who wants a cheaper frame
	 * turns it down.
	 */
	get weatherQuality(): WeatherQuality {
		return this.quality;
	}

	/**
	 * Whether the player has been through the first-launch accessibility pass.
	 *
	 * The pass is how consent is obtained before exposure to flashing and shake,
	 * so this is only set once the player has reached the end of it — skipping
	 * an individual item is a choice and still counts, ignoring the pass does
	 * not, because there is nothing to ignore it with. `FirstLaunchPass` is its
	 * only writer, and only from the last item's Done.
	 *
	 * Persisted in `localStorage` under **`bitsplash.settings:a11y.seen`**
	 * (`"1"` once seen, absent otherwise). Delete that key to get the pass back
	 * on the next launch.
	 */
	get accessibilitySeen(): boolean {
		return this.values.get(KEY.accessibilitySeen)! > 0;
	}

	setAccessibilitySeen(seen: boolean): void {
		this.writeNumber(KEY.accessibilitySeen, seen ? 1 : 0);
	}

	setWeatherQuality(quality: WeatherQuality): void {
		if (this.quality === quality) {
			return;
		}
		this.quality = quality;
		this.store.set(KEY.weatherQuality, quality);
		this.notify();
	}

	private readNumber(key: string, fallback: number): number {
		const raw = this.store.get(key);
		if (raw === null) {
			return fallback;
		}
		const value = Number.parseFloat(raw);
		return Number.isFinite(value) && value >= 0 ? value : fallback;
	}

	private writeNumber(key: string, value: number): void {
		if (
			!Number.isFinite(value) ||
			value < 0 ||
			this.values.get(key) === value
		) {
			return;
		}
		this.values.set(key, value);
		this.store.set(key, String(value));
		this.notify();
	}
}

/** The shared player settings, read by the mixer and the settings UI. */
export const playerSettings = new PlayerSettings();
