import type AudioManager from "../../engine/audio/audio";
import { webAudioAvailable } from "../../engine/audio/availability";
import { hasClimates } from "../../engine/weather/climate-registry";
import { pushWeatherAmbience } from "../../engine/weather/weather-ambience";
import {
	OPEN_SHELTER,
	weatherAudioMix,
} from "../../engine/weather/weather-audio-mix";

/** Every voice at zero gain — dead calm under open sky. */
const SILENT_MIX = weatherAudioMix(
	{ wind: 0, precipitation: 0, gust: 0 },
	OPEN_SHELTER,
);

/**
 * Mute the weather ambience for one frame of an editor world.
 *
 * The ambience graph belongs to the audio manager and worlds only push parameters
 * at it, where the last push of a frame wins. So a muted view steps its world
 * normally — foliage still sways, rain still falls — and then pushes silence over
 * whatever `WeatherAudioSystem` asked for. Nothing in the engine has to know the
 * editor is muted, and unmuting is just as cheap: stop pushing silence and the next
 * world push is heard again.
 *
 * Call once per frame, after the world's update, while muted.
 *
 * @example
 * this.scene.world.ecs.update(ctx);
 * if (this.weatherPreview.muted) {
 * 	silenceWeatherAudio(this.services.audio);
 * }
 */
export const silenceWeatherAudio = (audio: AudioManager): void => {
	if (!webAudioAvailable || !hasClimates()) {
		return;
	}
	pushWeatherAmbience(audio, SILENT_MIX);
};
