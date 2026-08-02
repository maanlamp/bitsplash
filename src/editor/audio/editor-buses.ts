import type { AudioApi } from "../../engine/audio/audio-api";
import type { AudioBus } from "../../engine/audio/audio-bus";

const mains = new WeakMap<AudioApi, AudioBus>();
const previews = new WeakMap<AudioApi, AudioBus>();

/**
 * The editor's own branch of the mixing tree, a sibling of the game's.
 *
 * Weakly keyed by the audio backend so it lives exactly as long as the backend
 * does, and so a discarded one is collectable.
 */
export const editorMainBus = (audio: AudioApi): AudioBus => {
	const existing = mains.get(audio);
	if (existing) {
		return existing;
	}
	const bus = audio.createBus();
	mains.set(audio, bus);
	return bus;
};

/**
 * The bus asset previews play on — the audio editor's scrub and playback.
 *
 * Deliberately a sibling of the scene views rather than a child of one: the
 * audio editor must keep sounding while a scene view is muted or unfocused,
 * because it is the thing the user is listening to.
 */
export const assetPreviewBus = (audio: AudioApi): AudioBus => {
	const existing = previews.get(audio);
	if (existing) {
		return existing;
	}
	const bus = audio.createBus(editorMainBus(audio));
	previews.set(audio, bus);
	return bus;
};
