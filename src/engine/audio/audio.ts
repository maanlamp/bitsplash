import type {
	AudioApi,
	LoopVoiceHandle,
	LoopVoiceOptions,
	PlayBufferOptions,
	PlaybackHandle,
	PlayOptions,
} from "./audio-api";
import { DEFAULT_VOICE_TAU } from "./audio-api";
import {
	type AudioBus,
	type AudioBusSet,
	type AudioCategory,
	busInput,
	createBusSetUnder,
	createWebAudioBus,
} from "./audio-bus";

type Cached<T> = Readonly<
	| { status: "loading" }
	| { status: "ready"; data: T }
	| { status: "error"; error: Error }
>;

const RESUME_EVENTS = [
	"pointerdown",
	"keydown",
	"touchstart",
] as const;

/**
 * Audio over a real `AudioContext`: buffer loading, one-shots, looping voices,
 * and the bus tree everything hangs from.
 *
 * The context is private and stays that way. Callers route sound by passing an
 * {@link AudioBus} rather than by reaching for nodes, which is what keeps
 * gain staging a property of the tree instead of a call-site convention.
 */
export default class AudioManager implements AudioApi {
	private ctx = new AudioContext();
	private readonly master: AudioBus;
	private readonly busSets = new Set<WeakRef<AudioBusSet>>();
	private sources: Map<string, Cached<AudioBuffer>> = new Map();
	private buffers: Map<string, Promise<AudioBuffer>> = new Map();
	private workletLoaded = false;
	private resumed = false;

	constructor() {
		this.master = createWebAudioBus(this.ctx, this.ctx.destination);
		void this.ctx.audioWorklet
			.addModule(
				new URL("./granular-processor.js", import.meta.url).href,
			)
			.then(() => {
				this.workletLoaded = true;
			});
		this.installAutoResume();
	}

	get sampleRate(): number {
		return this.ctx.sampleRate;
	}

	createBus(parent?: AudioBus): AudioBus {
		return (parent ?? this.master).createChild();
	}

	createBusSet(parent?: AudioBus): AudioBusSet {
		const set = createBusSetUnder(parent ?? this.master);
		this.busSets.add(new WeakRef(set));
		return set;
	}

	setMasterGain(gain: number): void {
		this.master.setUserGain(gain);
	}

	setCategoryGain(category: AudioCategory, gain: number): void {
		for (const ref of this.busSets) {
			const set = ref.deref();
			if (!set) {
				this.busSets.delete(ref);
				continue;
			}
			set[category].setUserGain(gain);
		}
	}

	decode(data: ArrayBuffer): Promise<AudioBuffer> {
		return this.ctx.decodeAudioData(data);
	}

	load(url: string): Promise<AudioBuffer> {
		const existing = this.buffers.get(url);
		if (existing) {
			return existing;
		}
		const pending = fetch(url)
			.then((response) => response.arrayBuffer())
			.then((data) => this.ctx.decodeAudioData(data));
		this.buffers.set(url, pending);
		return pending;
	}

	playBuffer(
		buffer: AudioBuffer,
		opts?: PlayBufferOptions,
	): PlaybackHandle {
		void this.ctx.resume();
		const offset = Math.max(
			0,
			Math.min(opts?.offset ?? 0, buffer.duration),
		);
		const source = new AudioBufferSourceNode(this.ctx, { buffer });
		if (opts?.detune !== undefined) {
			source.detune.value = opts.detune;
		}
		const gain = new GainNode(this.ctx, { gain: opts?.gain ?? 1 });
		const filter =
			opts?.lowpass === undefined
				? null
				: new BiquadFilterNode(this.ctx, {
						type: "lowpass",
						frequency: opts.lowpass,
					});
		const panner =
			opts?.pan === undefined
				? null
				: new StereoPannerNode(this.ctx, { pan: opts.pan });
		let tail: AudioNode = source;
		if (filter) {
			tail = tail.connect(filter);
		}
		if (panner) {
			tail = tail.connect(panner);
		}
		tail.connect(gain).connect(this.destinationFor(opts?.bus));
		let stopped = false;
		source.onended = () => {
			if (!stopped) {
				opts?.onEnded?.();
			}
			source.disconnect();
			filter?.disconnect();
			panner?.disconnect();
			gain.disconnect();
		};
		const startedAt = this.ctx.currentTime;
		const duration =
			opts?.duration !== undefined
				? Math.max(
						0,
						Math.min(opts.duration, buffer.duration - offset),
					)
				: undefined;
		const at = startedAt + Math.max(0, opts?.delay ?? 0);
		if (duration !== undefined) {
			source.start(at, offset, duration);
		} else {
			source.start(at, offset);
		}
		return {
			duration: buffer.duration,
			stop: () => {
				if (stopped) {
					return;
				}
				stopped = true;
				try {
					source.stop();
				} catch {
					source.disconnect();
					gain.disconnect();
				}
			},
			position: () =>
				Math.max(
					0,
					Math.min(
						offset + (this.ctx.currentTime - startedAt),
						buffer.duration,
					),
				),
		};
	}

	/**
	 * An empty mono buffer holding `seconds` of samples at the context's rate, for
	 * a caller that synthesizes its own source material instead of loading a file.
	 *
	 * @example
	 * const noise = audio.createBuffer(3);
	 * fillWhiteNoise(noise.getChannelData(0), 0x51a7);
	 */
	createBuffer(seconds: number, channels = 1): AudioBuffer {
		return this.ctx.createBuffer(
			channels,
			Math.max(1, Math.round(seconds * this.ctx.sampleRate)),
			this.ctx.sampleRate,
		);
	}

	/**
	 * Start a looping voice — `source -> filter? -> panner -> gain -> bus` — and
	 * hand back the parameters for a caller to keep pushing at.
	 *
	 * This is the one thing {@link playBuffer} cannot do: it never loops and its
	 * gain is a fixed construction value, so a sustained ambience has nothing to
	 * ride. Every pushed value is a `setTargetAtTime` at the current time, so the
	 * automation timeline never grows no matter how often a caller pushes. Fades
	 * on a state change belong on the voice's bus, not here.
	 *
	 * @example
	 * const wind = audio.playLoop(noise, {
	 * 	bus: world.audio.ambience,
	 * 	filter: { type: "lowpass", frequency: 400 },
	 * });
	 * wind.set({ gain: 0.3, frequency: 900, tau: 0.08 });
	 */
	playLoop(
		buffer: AudioBuffer,
		opts?: LoopVoiceOptions,
	): LoopVoiceHandle {
		void this.ctx.resume();
		const source = new AudioBufferSourceNode(this.ctx, {
			buffer,
			loop: true,
		});
		const filter = opts?.filter
			? new BiquadFilterNode(this.ctx, {
					type: opts.filter.type,
					frequency: opts.filter.frequency,
					Q: opts.filter.Q ?? 1,
				})
			: null;
		const panner = new StereoPannerNode(this.ctx, {
			pan: opts?.pan ?? 0,
		});
		const gain = new GainNode(this.ctx, { gain: opts?.gain ?? 0 });
		(filter ? source.connect(filter) : source)
			.connect(panner)
			.connect(gain)
			.connect(this.destinationFor(opts?.bus));
		source.start();

		let stopped = false;
		const approach = (
			param: AudioParam,
			value: number,
			tau: number,
		): void => {
			param.setTargetAtTime(value, this.ctx.currentTime, tau);
		};

		return {
			set: (params) => {
				if (stopped) {
					return;
				}
				const tau = Math.max(0.001, params.tau ?? DEFAULT_VOICE_TAU);
				if (params.gain !== undefined) {
					approach(gain.gain, params.gain, tau);
				}
				if (params.pan !== undefined) {
					approach(panner.pan, params.pan, tau);
				}
				if (params.frequency !== undefined && filter) {
					approach(filter.frequency, params.frequency, tau);
				}
			},
			stop: () => {
				if (stopped) {
					return;
				}
				stopped = true;
				try {
					source.stop();
				} finally {
					source.disconnect();
					filter?.disconnect();
					panner.disconnect();
					gain.disconnect();
				}
			},
		};
	}

	play(url: string, opts?: PlayOptions): void {
		const source = this.getSource(url);
		if (!source || !this.workletLoaded) {
			return;
		}

		const channels = Array.from(
			{ length: source.numberOfChannels },
			(_, c) => source.getChannelData(c),
		);
		const node = new AudioWorkletNode(this.ctx, "granular-shifter", {
			numberOfInputs: 0,
			outputChannelCount: [source.numberOfChannels],
			processorOptions: {
				channels,
				length: source.length,
				sampleRate: source.sampleRate,
			},
		});
		node.parameters.get("pitch")!.value = opts?.pitch ?? 1;
		node.parameters.get("speed")!.value = opts?.speed ?? 1;

		const gain = new GainNode(this.ctx, { gain: opts?.gain ?? 1 });
		node.connect(gain).connect(this.destinationFor());
		node.port.onmessage = () => {
			node.disconnect();
			gain.disconnect();
		};
	}

	private destinationFor(bus?: AudioBus): AudioNode {
		return (
			busInput(bus ?? this.master) ??
			(this.ctx.destination as AudioNode)
		);
	}

	private getSource(url: string): AudioBuffer | void {
		if (!this.sources.has(url)) {
			this.sources.set(url, { status: "loading" });
			void fetch(url)
				.then((response) => response.arrayBuffer())
				.then((buffer) => this.ctx.decodeAudioData(buffer))
				.then((data) => {
					this.sources.set(url, { status: "ready", data });
				})
				.catch((error) => {
					this.sources.set(url, { status: "error", error });
				});
			return;
		}
		const asset = this.sources.get(url);
		if (asset?.status !== "ready") {
			return;
		}
		return asset.data;
	}

	private installAutoResume(): void {
		const resume = (): void => {
			if (this.resumed) {
				return;
			}
			this.resumed = true;
			void this.ctx.resume();
			for (const type of RESUME_EVENTS) {
				window.removeEventListener(type, resume);
			}
		};
		for (const type of RESUME_EVENTS) {
			window.addEventListener(type, resume);
		}
	}
}
