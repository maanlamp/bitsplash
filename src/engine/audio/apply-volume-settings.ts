import {
	type PlayerSettings,
	playerSettings,
} from "../settings/player-settings";
import { volumeGain } from "../settings/volume-gain";
import type { AudioApi } from "./audio-api";
import { AUDIO_CATEGORIES } from "./audio-bus";

/**
 * Keep the mixer's **user** gains in step with what the player chose. Returns an
 * unsubscribe.
 *
 * Only user gain is written here. Focus, pause and ducking own system gain, and
 * the two never meet — which is why a blur can never leave a volume changed
 * behind it.
 *
 * @example
 * this.detachVolumes = applyVolumeSettings(this.audio);
 */
export const applyVolumeSettings = (
	audio: AudioApi,
	settings: PlayerSettings = playerSettings,
): (() => void) => {
	const apply = (): void => {
		audio.setMasterGain(volumeGain(settings.masterVolume));
		for (const category of AUDIO_CATEGORIES) {
			audio.setCategoryGain(
				category,
				volumeGain(settings.volume(category)),
			);
		}
	};
	apply();
	return settings.subscribe(apply);
};
