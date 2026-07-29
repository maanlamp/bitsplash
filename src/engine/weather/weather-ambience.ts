import type AudioManager from "../audio/audio";
import type { LoopVoiceHandle } from "../audio/audio";
import { fillWhiteNoise } from "../audio/noise-buffer";
import {
	onWindowFocusChange,
	windowHasFocus,
} from "../audio/window-focus";
import {
	AMBIENCE_SILENCE_RAMP,
	AMBIENCE_STALE_SECONDS,
	type WeatherAudioMix,
	WIND_VOICE_Q,
} from "./weather-audio-mix";

/**
 * Seconds of noise per voice. Long enough that the loop's period is not a
 * recognisable pattern, short enough to stay a rounding error in memory.
 */
const NOISE_SECONDS = 3;

/** Seconds each pushed parameter change ramps over — one frame's worth, plus slack. */
const PUSH_RAMP = 0.08;

/** Seconds the ambience takes to duck out when the window loses OS focus. */
const BLUR_RAMP = 0.12;

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
};

const VOICE_NAMES = Object.keys(VOICES) as readonly VoiceName[];

/**
 * The one running weather ambience: five looping noise voices and nothing else.
 *
 * **Deliberately not per world.** `AudioManager` is host-scoped and outlives every
 * world — `World.dispose` disposes physics and nothing else — so a loop owned by a
 * world would keep sounding after run-stop, a scene swap, or quitting to the
 * editor. Instead the graph belongs to the manager, worlds only *push* parameters
 * at it, and the last push in a frame wins. Three problems dissolve at once:
 *
 * - **teardown**: a dead world simply stops pushing;
 * - **pause**: a paused host ticks no systems, so nothing pushes and the graph
 *   fades itself out — pause-suspend with no host involvement;
 * - **two editor views**: only the focused one ticks its world, so only it pushes.
 *
 * The fade is scheduled onto the gain params ahead of time (see
 * `LoopVoiceHandle.silenceAfter`), so silence arrives without anything running.
 *
 * Being unattended is a separate question from being dead, and is answered by OS
 * window focus rather than by staleness: an unfocused window ducks immediately and
 * a refocused one is restored by the next push. Panel focus deliberately plays no
 * part — the editor steps only its focused scene view, so gating on that would duck
 * the weather every time a toolbar button took focus from the canvas.
 */
class WeatherAmbience {
	private readonly voices: Readonly<
		Record<VoiceName, LoopVoiceHandle>
	>;

	constructor(audio: AudioManager) {
		this.voices = Object.fromEntries(
			VOICE_NAMES.map((name) => {
				const spec = VOICES[name];
				const buffer = audio.createBuffer(NOISE_SECONDS);
				fillWhiteNoise(buffer.getChannelData(0), spec.seed);
				return [
					name,
					audio.playLoop(buffer, {
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

	/** Take one frame's parameters and re-arm the fade-out. */
	push(mix: WeatherAudioMix): void {
		const audible = windowHasFocus();
		for (const name of VOICE_NAMES) {
			const voice = this.voices[name];
			const params = mix[name];
			voice.set({
				gain: audible ? params.gain : 0,
				frequency: params.frequency,
				pan: params.pan,
				ramp: PUSH_RAMP,
			});
			voice.silenceAfter(
				AMBIENCE_STALE_SECONDS,
				AMBIENCE_SILENCE_RAMP,
			);
		}
	}

	/** Duck to silence now, without waiting for a push that may never come. */
	duck(): void {
		for (const name of VOICE_NAMES) {
			this.voices[name].silenceAfter(0, BLUR_RAMP);
		}
	}
}

const graphs = new WeakMap<AudioManager, WeatherAmbience>();

/**
 * Graphs that exist, so a focus change can reach them. Weak, so an abandoned
 * manager is still collectable.
 */
const live = new Set<WeakRef<WeatherAmbience>>();
let focusHooked = false;

const hookFocus = (): void => {
	if (focusHooked) {
		return;
	}
	focusHooked = true;
	onWindowFocusChange((isFocused) => {
		if (isFocused) {
			return;
		}
		for (const ref of live) {
			ref.deref()?.duck();
		}
	});
};

/**
 * Push a frame of weather ambience, building the graph on the first push.
 *
 * Only call this where WebAudio genuinely exists (`webAudioAvailable`): it reaches
 * into the manager, and a headless host's stand-in throws on any property access.
 *
 * @example
 * if (webAudioAvailable) {
 * 	pushWeatherAmbience(ctx.audio, weatherAudioMix(input, shelter));
 * }
 */
export const pushWeatherAmbience = (
	audio: AudioManager,
	mix: WeatherAudioMix,
): void => {
	const existing = graphs.get(audio);
	if (existing) {
		existing.push(mix);
		return;
	}
	const graph = new WeatherAmbience(audio);
	graphs.set(audio, graph);
	live.add(new WeakRef(graph));
	hookFocus();
	graph.push(mix);
};
