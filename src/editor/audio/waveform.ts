export type Peak = Readonly<{ min: number; max: number }>;

export const mixToMono = (buffer: AudioBuffer): Float32Array => {
	const channels = buffer.numberOfChannels;
	if (channels === 1) {
		return buffer.getChannelData(0);
	}
	const length = buffer.length;
	const mono = new Float32Array(length);
	for (let c = 0; c < channels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < length; i++) {
			mono[i]! += data[i]! / channels;
		}
	}
	return mono;
};

export const computePeaks = (
	samples: Float32Array,
	count: number,
): ReadonlyArray<Peak> => {
	const peaks: Peak[] = [];
	const total = samples.length;
	if (total === 0 || count <= 0) {
		return peaks;
	}
	const per = total / count;
	for (let i = 0; i < count; i++) {
		const start = Math.floor(i * per);
		const end = Math.min(total, Math.floor((i + 1) * per));
		let min = 1;
		let max = -1;
		for (let s = start; s < end; s++) {
			const value = samples[s]!;
			if (value < min) {
				min = value;
			}
			if (value > max) {
				max = value;
			}
		}
		if (start >= end) {
			min = 0;
			max = 0;
		}
		peaks.push({ min, max });
	}
	return peaks;
};
