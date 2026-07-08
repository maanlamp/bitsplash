export type VoicedSegment = Readonly<{
	offset: number;
	duration: number;
}>;

export type SegmentOptions = Readonly<{
	windowMs?: number;
	thresholdRatio?: number;
	minVoicedMs?: number;
	minGapMs?: number;
}>;

const DEFAULTS = {
	windowMs: 10,
	thresholdRatio: 0.06,
	minVoicedMs: 40,
	minGapMs: 50,
} as const;

export const detectVoicedSegments = (
	samples: Float32Array,
	sampleRate: number,
	opts?: SegmentOptions,
): VoicedSegment[] => {
	const windowMs = opts?.windowMs ?? DEFAULTS.windowMs;
	const thresholdRatio =
		opts?.thresholdRatio ?? DEFAULTS.thresholdRatio;
	const minVoicedMs = opts?.minVoicedMs ?? DEFAULTS.minVoicedMs;
	const minGapMs = opts?.minGapMs ?? DEFAULTS.minGapMs;

	const win = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
	const rms: number[] = [];
	for (let i = 0; i < samples.length; i += win) {
		let sum = 0;
		let n = 0;
		for (let j = i; j < i + win && j < samples.length; j++) {
			sum += samples[j]! * samples[j]!;
			n++;
		}
		rms.push(Math.sqrt(sum / Math.max(1, n)));
	}

	let peak = 0;
	for (const value of rms) {
		if (value > peak) {
			peak = value;
		}
	}
	if (peak <= 0) {
		return [];
	}

	const threshold = peak * thresholdRatio;
	const minVoiced = Math.max(1, Math.round(minVoicedMs / windowMs));
	const minGap = Math.max(1, Math.round(minGapMs / windowMs));
	const perWindow = win / sampleRate;

	const segments: VoicedSegment[] = [];
	let start = -1;
	let gap = 0;
	const push = (from: number, to: number): void => {
		if (to - from >= minVoiced) {
			segments.push({
				offset: from * perWindow,
				duration: (to - from) * perWindow,
			});
		}
	};
	for (let i = 0; i < rms.length; i++) {
		if (rms[i]! > threshold) {
			if (start < 0) {
				start = i;
			}
			gap = 0;
		} else if (start >= 0) {
			gap++;
			if (gap >= minGap) {
				push(start, i - gap + 1);
				start = -1;
				gap = 0;
			}
		}
	}
	if (start >= 0) {
		push(start, rms.length - gap);
	}
	return segments;
};
