import type {
	AudioBus,
	AudioBusSet,
	AudioCategory,
} from "./audio-bus";

export type PlayOptions = Readonly<{
	pitch?: number;
	speed?: number;
	gain?: number;
}>;

export type PlayBufferOptions = Readonly<{
	offset?: number;
	duration?: number;
	detune?: number;
	gain?: number;
	onEnded?: () => void;
	/** Which bus to play on. Defaults to the master bus. */
	bus?: AudioBus;
	/**
	 * Stereo position, `-1..1`. Omitted plays centred with no panner in the
	 * chain.
	 */
	pan?: number;
	/**
	 * Lowpass cutoff in Hz. Omitted plays unfiltered. This is a fixed filter set
	 * once at construction, not a parameter to push at: a one-shot is over before
	 * anything could ride it.
	 */
	lowpass?: number;
	/**
	 * Seconds to wait before the source starts — the arrival delay of a sound
	 * that happened somewhere else. Scheduled on the audio clock rather than with
	 * a timer, so a thunder layer lands where the physics says it should even if
	 * frames are late.
	 */
	delay?: number;
}>;

export type PlaybackHandle = Readonly<{
	stop: () => void;
	position: () => number;
	duration: number;
}>;

/** The character filter a looping voice is born with. */
export type LoopVoiceFilter = Readonly<{
	type: BiquadFilterType;
	frequency: number;
	/** Resonance. Only meaningful for the band/peaking types. */
	Q?: number;
}>;

export type LoopVoiceOptions = Readonly<{
	/** Starting gain. Defaults to `0`, so a voice fades in rather than cracking on. */
	gain?: number;
	/** Starting stereo position, `-1..1`. Defaults to centred. */
	pan?: number;
	filter?: LoopVoiceFilter;
	/** Which bus to play on. Defaults to the master bus. */
	bus?: AudioBus;
}>;

/** New values for a voice's live parameters. Omitted fields are left alone. */
export type LoopVoiceParams = Readonly<{
	gain?: number;
	pan?: number;
	/** Filter centre/cutoff frequency in Hz. Ignored on a voice with no filter. */
	frequency?: number;
	/**
	 * Time constant of the approach to the new values, in seconds. Defaults to
	 * {@link DEFAULT_VOICE_TAU}.
	 */
	tau?: number;
}>;

/**
 * A running looping voice whose parameters are pushed from outside.
 *
 * Every parameter write is a `setTargetAtTime` at the current time and nothing
 * else — no ramp, no cancel, nothing scheduled in the future. A caller pushing
 * sixty times a second therefore leaves at most one event per parameter on the
 * automation timeline, which is what a voice riding live values requires.
 * A voice runs until {@link LoopVoiceHandle.stop}, or until the bus it plays on
 * is disposed.
 */
export type LoopVoiceHandle = Readonly<{
	set: (params: LoopVoiceParams) => void;
	stop: () => void;
}>;

/** Default time constant for a pushed voice parameter, in seconds. */
export const DEFAULT_VOICE_TAU = 0.05;

/**
 * Everything the engine may ask of audio.
 *
 * Two implementations exist: `AudioManager` over a real `AudioContext`, and
 * `NullAudioManager` for hosts without one. `createAudio()` picks. Because the
 * null backend is a real implementation rather than a stub, no system has to
 * check whether audio exists before using it.
 */
export interface AudioApi {
	readonly sampleRate: number;
	decode(data: ArrayBuffer): Promise<AudioBuffer>;
	load(url: string): Promise<AudioBuffer>;
	/** An empty mono buffer holding `seconds` of samples at the context's rate. */
	createBuffer(seconds: number, channels?: number): AudioBuffer;
	playBuffer(
		buffer: AudioBuffer,
		opts?: PlayBufferOptions,
	): PlaybackHandle;
	playLoop(
		buffer: AudioBuffer,
		opts?: LoopVoiceOptions,
	): LoopVoiceHandle;
	play(url: string, opts?: PlayOptions): void;
	/** A new bus under `parent`, or under the master bus. */
	createBus(parent?: AudioBus): AudioBus;
	/**
	 * A category bus per {@link AUDIO_CATEGORIES} entry under `parent`, tracked
	 * so {@link AudioApi.setCategoryGain} reaches it.
	 */
	createBusSet(parent?: AudioBus): AudioBusSet;
	/** Player master volume, as a gain. Writes user gain only. */
	setMasterGain(gain: number): void;
	/** Player volume for one category, as a gain. Writes user gain only. */
	setCategoryGain(category: AudioCategory, gain: number): void;
}
