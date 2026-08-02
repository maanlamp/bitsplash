import type {
	AudioApi,
	LoopVoiceHandle,
	PlaybackHandle,
} from "./audio-api";
import {
	type AudioBus,
	type AudioBusSet,
	type AudioCategory,
	createBusSetUnder,
} from "./audio-bus";
import { NullAudioBus } from "./null-audio-bus";

/** The rate a null backend reports, so callers sizing buffers get sane numbers. */
const NOMINAL_SAMPLE_RATE = 48_000;

const SILENT_HANDLE: PlaybackHandle = {
	stop: () => {},
	position: () => 0,
	duration: 0,
};

const SILENT_VOICE: LoopVoiceHandle = {
	set: () => {},
	stop: () => {},
};

/**
 * A silent {@link AudioApi} for hosts with no `AudioContext` — Bun, the test
 * suite, any headless runner.
 *
 * It is a real implementation, not a stub: the bus tree it builds is complete
 * and inspectable (see {@link NullAudioBus}), and every method returns something
 * usable. That is what lets `webAudioAvailable` stop being a gate every system
 * has to remember to check, and what makes the tree and the focus derivation
 * assertable in a test.
 *
 * `load` and `decode` return promises that never settle. A caller warming a
 * bank therefore never builds one and never plays, which is the same shape as
 * a real load that has not arrived yet.
 */
export class NullAudioManager implements AudioApi {
	readonly master = new NullAudioBus();
	readonly sampleRate = NOMINAL_SAMPLE_RATE;
	private readonly sets: AudioBusSet[] = [];

	decode(): Promise<AudioBuffer> {
		return new Promise<AudioBuffer>(() => {});
	}

	load(): Promise<AudioBuffer> {
		return new Promise<AudioBuffer>(() => {});
	}

	createBuffer(seconds: number, channels = 1): AudioBuffer {
		const length = Math.max(
			1,
			Math.round(seconds * NOMINAL_SAMPLE_RATE),
		);
		const data = Array.from(
			{ length: channels },
			() => new Float32Array(length),
		);
		const buffer: AudioBuffer = {
			length,
			duration: length / NOMINAL_SAMPLE_RATE,
			numberOfChannels: channels,
			sampleRate: NOMINAL_SAMPLE_RATE,
			getChannelData: (channel: number) => data[channel]!,
			copyFromChannel: () => {},
			copyToChannel: () => {},
		};
		return buffer;
	}

	playBuffer(): PlaybackHandle {
		return SILENT_HANDLE;
	}

	playLoop(): LoopVoiceHandle {
		return SILENT_VOICE;
	}

	play(): void {}

	createBus(parent?: AudioBus): AudioBus {
		return (parent ?? this.master).createChild();
	}

	createBusSet(parent?: AudioBus): AudioBusSet {
		const set = createBusSetUnder(parent ?? this.master);
		this.sets.push(set);
		return set;
	}

	setMasterGain(gain: number): void {
		this.master.setUserGain(gain);
	}

	setCategoryGain(category: AudioCategory, gain: number): void {
		for (const set of this.sets) {
			set[category].setUserGain(gain);
		}
	}
}
