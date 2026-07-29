type Cached<T> = Readonly<
	| { status: "loading" }
	| { status: "ready"; data: T }
	| { status: "error"; error: Error }
>;

type PlayOptions = Readonly<{
	pitch?: number;
	speed?: number;
	gain?: number;
}>;

type PlayBufferOptions = Readonly<{
	offset?: number;
	duration?: number;
	detune?: number;
	gain?: number;
	onEnded?: () => void;
}>;

export type PlaybackHandle = Readonly<{
	stop: () => void;
	position: () => number;
	duration: number;
}>;

/** The character filter a looping voice is born with. */
type LoopVoiceFilter = Readonly<{
	type: BiquadFilterType;
	frequency: number;
	/** Resonance. Only meaningful for the band/peaking types. */
	Q?: number;
}>;

type LoopVoiceOptions = Readonly<{
	/** Starting gain. Defaults to `0`, so a voice fades in rather than cracking on. */
	gain?: number;
	/** Starting stereo position, `-1..1`. Defaults to centred. */
	pan?: number;
	filter?: LoopVoiceFilter;
}>;

/** New values for a voice's live parameters. Omitted fields are left alone. */
type LoopVoiceParams = Readonly<{
	gain?: number;
	pan?: number;
	/** Filter centre/cutoff frequency in Hz. Ignored on a voice with no filter. */
	frequency?: number;
	/** Seconds to reach the new values. Defaults to {@link DEFAULT_LOOP_RAMP}. */
	ramp?: number;
}>;

/**
 * A running looping voice whose parameters are pushed from outside.
 *
 * {@link LoopVoiceHandle.silenceAfter} is a dead-man's switch: it schedules a
 * fade to silence in the future that the next {@link LoopVoiceHandle.set} cancels.
 * A caller that pushes every frame is never heard fading; a caller that stops
 * pushing — because its world was torn down, or its host paused and stopped
 * ticking systems — goes quiet on its own with nothing left to run.
 */
export type LoopVoiceHandle = Readonly<{
	set: (params: LoopVoiceParams) => void;
	silenceAfter: (delay: number, ramp?: number) => void;
	stop: () => void;
}>;

const DEFAULT_LOOP_RAMP = 0.05;

const RESUME_EVENTS = [
	"pointerdown",
	"keydown",
	"touchstart",
] as const;

export default class AudioManager {
	private ctx = new AudioContext();
	private sources: Map<string, Cached<AudioBuffer>> = new Map();
	private buffers: Map<string, Promise<AudioBuffer>> = new Map();
	private workletLoaded = false;
	private resumed = false;

	constructor() {
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
		source.connect(gain).connect(this.ctx.destination);
		let stopped = false;
		source.onended = () => {
			if (!stopped) {
				opts?.onEnded?.();
			}
			source.disconnect();
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
		if (duration !== undefined) {
			source.start(0, offset, duration);
		} else {
			source.start(0, offset);
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
	 * Start a looping voice — `source -> filter? -> panner -> gain -> destination`
	 * — and hand back the parameters for a caller to keep pushing at.
	 *
	 * This is the one thing {@link playBuffer} cannot do: it never loops and its
	 * gain is a fixed construction value, so a sustained ambience has nothing to
	 * ride. A voice runs until {@link LoopVoiceHandle.stop}; prefer letting
	 * {@link LoopVoiceHandle.silenceAfter} take it to silence over stopping and
	 * restarting, which re-triggers the loop from its head.
	 *
	 * @example
	 * const wind = audio.playLoop(noise, { filter: { type: "lowpass", frequency: 400 } });
	 * wind.set({ gain: 0.3, frequency: 900, ramp: 0.1 });
	 * wind.silenceAfter(0.15);
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
			.connect(this.ctx.destination);
		source.start();

		let level = opts?.gain ?? 0;
		let stopped = false;
		const ramp = (
			param: AudioParam,
			value: number,
			seconds: number,
		): void => {
			const now = this.ctx.currentTime;
			param.cancelAndHoldAtTime(now);
			if (seconds > 0) {
				param.linearRampToValueAtTime(value, now + seconds);
			} else {
				param.setValueAtTime(value, now);
			}
		};

		return {
			set: (params) => {
				if (stopped) {
					return;
				}
				const seconds = params.ramp ?? DEFAULT_LOOP_RAMP;
				if (params.gain !== undefined) {
					level = params.gain;
					ramp(gain.gain, params.gain, seconds);
				}
				if (params.pan !== undefined) {
					ramp(panner.pan, params.pan, seconds);
				}
				if (params.frequency !== undefined && filter) {
					ramp(filter.frequency, params.frequency, seconds);
				}
			},
			silenceAfter: (delay, rampSeconds = 0.1) => {
				if (stopped) {
					return;
				}
				const at = this.ctx.currentTime + Math.max(0, delay);
				gain.gain.setValueAtTime(level, at);
				gain.gain.linearRampToValueAtTime(
					0,
					at + Math.max(0.001, rampSeconds),
				);
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
		node.connect(gain).connect(this.ctx.destination);
		node.port.onmessage = () => {
			node.disconnect();
			gain.disconnect();
		};
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
