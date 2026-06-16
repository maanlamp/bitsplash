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
	gain?: number;
	onEnded?: () => void;
}>;

export type PlaybackHandle = Readonly<{
	stop: () => void;
	position: () => number;
	duration: number;
}>;

const RESUME_EVENTS = [
	"pointerdown",
	"keydown",
	"touchstart",
] as const;

export default class AudioManager {
	private ctx = new AudioContext();
	private sources: Map<string, Cached<AudioBuffer>> = new Map();
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
		source.start(0, offset);
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
