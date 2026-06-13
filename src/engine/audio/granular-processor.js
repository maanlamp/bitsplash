const EPS = 1e-6;
const GRAIN_SECONDS = 0.05;
const MIN_GRAIN = 256;
const OVERLAP = 4;

const hann = (length) => {
	const window = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		window[i] =
			0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
	}
	return window;
};

class GranularShifter extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
			{
				name: "pitch",
				defaultValue: 1,
				minValue: 0.25,
				maxValue: 4,
				automationRate: "k-rate",
			},
			{
				name: "speed",
				defaultValue: 1,
				minValue: 0.25,
				maxValue: 4,
				automationRate: "k-rate",
			},
		];
	}

	constructor(options) {
		super();
		const { channels, length, sampleRate } = options.processorOptions;
		this.channels = channels;
		this.length = length;
		this.grainSize = Math.max(
			MIN_GRAIN,
			Math.min(Math.round(GRAIN_SECONDS * sampleRate), length),
		);
		this.hop = Math.max(1, Math.floor(this.grainSize / OVERLAP));
		this.window = hann(this.grainSize);
		this.inputPos = 0;
		this.outFrame = 0;
		this.nextGrainOut = 0;
		this.grains = [];
		this.done = false;
	}

	process(_inputs, outputs, parameters) {
		const output = outputs[0];
		if (!output || output.length === 0) {
			return true;
		}

		const pitch = parameters.pitch[0];
		const speed = parameters.speed[0];
		const { channels, grainSize, hop, window, length } = this;
		const numChannels = output.length;
		const frames = output[0].length;

		for (let f = 0; f < frames; f++) {
			if (!this.done && this.outFrame === this.nextGrainOut) {
				this.grains.push({
					startOut: this.outFrame,
					inputStart: this.inputPos,
				});
				this.inputPos += hop * speed;
				this.nextGrainOut += hop;
				if (this.inputPos >= length) {
					this.done = true;
				}
			}

			for (let c = 0; c < numChannels; c++) {
				const source = channels[Math.min(c, channels.length - 1)];
				let acc = 0;
				let wsum = 0;
				for (let g = 0; g < this.grains.length; g++) {
					const grain = this.grains[g];
					const age = this.outFrame - grain.startOut;
					if (age < 0 || age >= grainSize) {
						continue;
					}
					const pos = grain.inputStart + age * pitch;
					const i0 = Math.floor(pos);
					const frac = pos - i0;
					const s0 = i0 >= 0 && i0 < length ? source[i0] : 0;
					const s1 =
						i0 + 1 >= 0 && i0 + 1 < length ? source[i0 + 1] : 0;
					const win = window[age];
					acc += (s0 + (s1 - s0) * frac) * win;
					wsum += win;
				}
				output[c][f] = wsum > EPS ? acc / wsum : 0;
			}

			this.outFrame++;
			if (
				this.grains.length > 0 &&
				this.outFrame - this.grains[0].startOut >= grainSize
			) {
				this.grains.shift();
			}
		}

		if (this.done && this.grains.length === 0) {
			this.port.postMessage("ended");
			return false;
		}
		return true;
	}
}

registerProcessor("granular-shifter", GranularShifter);
