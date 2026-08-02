import type { AudioApi, LoopVoiceHandle } from "../audio/audio-api";
import type { AudioBus } from "../audio/audio-bus";
import { fillWhiteNoise } from "../audio/noise-buffer";
import {
	SAND_VOICE_Q,
	type WeatherAudioMix,
	WIND_VOICE_Q,
} from "./weather-audio-mix";

/**
 * Seconds of noise per voice. Long enough that the loop's period is not a
 * recognisable pattern, short enough to stay a rounding error in memory.
 */
const NOISE_SECONDS = 3;

/**
 * Time constant of a pushed parameter, in seconds. Comfortably longer than a
 * frame, so sixty pushes a second read as one continuous move.
 */
const PUSH_TAU = 0.08;

type VoiceName = keyof WeatherAudioMix;

/**
 * A voice's fixed character: which filter shapes its noise, and the seed that
 * makes its noise its own. Voices sharing a seed would sum coherently into one
 * louder copy of a single voice.
 */
type VoiceSpec = Readonly<{
	type: BiquadFilterType;
	frequency: number;
	Q: number;
	seed: number;
}>;

const VOICES: Readonly<Record<VoiceName, VoiceSpec>> = {
	bed: {
		type: "lowpass",
		frequency: 400,
		Q: 1,
		seed: 0x1f35_9a21,
	},
	eave: {
		type: "bandpass",
		frequency: 160,
		Q: WIND_VOICE_Q.eave,
		seed: 0x74c2_1d0b,
	},
	whistle: {
		type: "bandpass",
		frequency: 380,
		Q: WIND_VOICE_Q.whistle,
		seed: 0xb903_66e7,
	},
	rainLight: {
		type: "lowpass",
		frequency: 2500,
		Q: 1,
		seed: 0x2ad8_51f3,
	},
	rainHeavy: {
		type: "lowpass",
		frequency: 700,
		Q: 1,
		seed: 0x5e17_c8a9,
	},
	sandHiss: {
		type: "highpass",
		frequency: 800,
		Q: 1,
		seed: 0x38f4_2b6d,
	},
	sandMid: {
		type: "bandpass",
		frequency: 320,
		Q: SAND_VOICE_Q.mid,
		seed: 0xc16a_9d45,
	},
};

const VOICE_NAMES = Object.keys(VOICES) as readonly VoiceName[];

/**
 * One looping noise voice per {@link WeatherAudioMix} voice, on one bus, and
 * nothing else.
 *
 * It knows nothing about focus, pause or muting. Those are properties of the
 * bus it was handed — a scene view's, a world's — and the bus is written on
 * state changes only. All this does is push parameters, every one of them a
 * `setTargetAtTime` at the current time, so a frame of pushes leaves the
 * automation timeline exactly as long as it found it.
 *
 * Its lifetime is its bus's: `World.dispose` takes the bus down and the world
 * that owned this graph stops it.
 *
 * @example
 * const ambience = new WeatherAmbience(ctx.audio, ctx.world.audio.ambience);
 * ctx.world.onDispose(() => ambience.stop());
 */
export class WeatherAmbience {
	private readonly voices: Readonly<
		Record<VoiceName, LoopVoiceHandle>
	>;

	constructor(audio: AudioApi, bus: AudioBus) {
		this.voices = Object.fromEntries(
			VOICE_NAMES.map((name) => {
				const spec = VOICES[name];
				const buffer = audio.createBuffer(NOISE_SECONDS);
				fillWhiteNoise(buffer.getChannelData(0), spec.seed);
				return [
					name,
					audio.playLoop(buffer, {
						bus,
						gain: 0,
						filter: {
							type: spec.type,
							frequency: spec.frequency,
							Q: spec.Q,
						},
					}),
				];
			}),
		) as Record<VoiceName, LoopVoiceHandle>;
	}

	/** Take one frame's parameters. */
	push(mix: WeatherAudioMix): void {
		for (const name of VOICE_NAMES) {
			const params = mix[name];
			this.voices[name].set({
				gain: params.gain,
				frequency: params.frequency,
				pan: params.pan,
				tau: PUSH_TAU,
			});
		}
	}

	/** Stop every voice. Called when the owning world is disposed. */
	stop(): void {
		for (const name of VOICE_NAMES) {
			this.voices[name].stop();
		}
	}
}
