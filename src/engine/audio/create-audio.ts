import type { AudioApi } from "./audio-api";
import AudioManager from "./audio";
import { NullAudioManager } from "./null-audio-manager";

/**
 * The audio backend for this host: WebAudio where it exists, silent where it
 * does not.
 *
 * This is the only place the platform check belongs. Everything downstream
 * receives a working {@link AudioApi} and never asks whether audio is real.
 *
 * @example
 * this.audio = createAudio();
 */
export const createAudio = (): AudioApi =>
	typeof AudioContext === "undefined"
		? new NullAudioManager()
		: new AudioManager();
