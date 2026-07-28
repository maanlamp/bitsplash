import type AudioManager from "../../engine/audio/audio";
import {
	VOICE_BANK_URLS,
	VoiceBanks,
} from "../content/assets/assets.gen";
import type { VoiceBankId } from "./voice-bank-id";
import {
	detectVoicedSegments,
	type VoicedSegment,
} from "./voiced-segments";

/**
 * Fetchable URL per bank id, generated from the `voice_bank_*.wav` assets, so the
 * id vocabulary and the URL map cannot disagree. Reach an individual id through
 * {@link VoiceBanks} rather than a bare string.
 */
export const VOICE_BANKS: Readonly<Record<string, string>> =
	VOICE_BANK_URLS;

export const DEFAULT_VOICE_BANK: VoiceBankId = VoiceBanks.sign;

export const VOWEL_COUNT = 5;

export type BankTake = Readonly<{
	offset: number;
	duration: number;
	gain: number;
}>;

export type LoadedBank = Readonly<{
	buffer: AudioBuffer;
	vowels: ReadonlyArray<ReadonlyArray<BankTake>>;
	avgDuration: number;
}>;

export const isVoicedChar = (char: string): boolean =>
	/\p{L}/u.test(char);

const LETTER_TO_VOWEL: Readonly<Record<string, number>> = {
	a: 0,
	b: 3,
	c: 2,
	d: 1,
	e: 1,
	f: 1,
	g: 0,
	h: 0,
	i: 2,
	j: 3,
	k: 0,
	l: 1,
	m: 4,
	n: 1,
	o: 3,
	p: 3,
	q: 4,
	r: 0,
	s: 2,
	t: 1,
	u: 4,
	v: 1,
	w: 4,
	x: 2,
	y: 2,
	z: 2,
};

export const vowelIndexForChar = (char: string): number =>
	LETTER_TO_VOWEL[char.toLowerCase()] ?? 0;

export const groupSegmentsByVowel = <T>(
	segments: readonly T[],
): T[][] => {
	const vowels: T[][] = Array.from({ length: VOWEL_COUNT }, () => []);
	segments.forEach((segment, i) => {
		vowels[i % VOWEL_COUNT]!.push(segment);
	});
	return vowels;
};

const downmixToMono = (buffer: AudioBuffer): Float32Array => {
	const channels = buffer.numberOfChannels;
	const mono = new Float32Array(buffer.length);
	for (let c = 0; c < channels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < data.length; i++) {
			mono[i]! += data[i]! / channels;
		}
	}
	return mono;
};

const TARGET_RMS = 0.15;
const PEAK_LIMIT = 0.97;
const MAX_GAIN = 8;

const normalizedGain = (
	mono: Float32Array,
	sampleRate: number,
	segment: VoicedSegment,
): number => {
	const start = Math.floor(segment.offset * sampleRate);
	const end = Math.min(
		mono.length,
		Math.floor((segment.offset + segment.duration) * sampleRate),
	);
	let sum = 0;
	let peak = 0;
	for (let i = start; i < end; i++) {
		const s = mono[i]!;
		sum += s * s;
		const a = Math.abs(s);
		if (a > peak) {
			peak = a;
		}
	}
	const rms = Math.sqrt(sum / Math.max(1, end - start));
	if (rms <= 0) {
		return 1;
	}
	const byPeak = peak > 0 ? PEAK_LIMIT / peak : MAX_GAIN;
	return Math.min(TARGET_RMS / rms, byPeak, MAX_GAIN);
};

export const loadBank = async (
	audio: AudioManager,
	url: string,
): Promise<LoadedBank> => {
	const buffer = await audio.load(url);
	const mono = downmixToMono(buffer);
	const segments = detectVoicedSegments(mono, buffer.sampleRate);
	const takes: BankTake[] = segments.map((segment) => ({
		offset: segment.offset,
		duration: segment.duration,
		gain: normalizedGain(mono, buffer.sampleRate, segment),
	}));
	const avgDuration =
		takes.length > 0
			? takes.reduce((sum, t) => sum + t.duration, 0) / takes.length
			: 0;
	return {
		buffer,
		vowels: groupSegmentsByVowel(takes),
		avgDuration,
	};
};
