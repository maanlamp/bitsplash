import type AudioManager from "../../engine/audio/audio";
import { Subscribable } from "../subscribable";
import type { AudioClip } from "./audio-clip";
import { encodeWav } from "./encode-wav";
import { computePeaks, mixToMono, type Peak } from "./waveform";

const BASE_PEAK_RESOLUTION = 8192;
const MIN_CLIP_DURATION = 0.01;

let nextClipId = 0;
const clipId = (): string => `clip-${++nextClipId}`;

export type DocumentSnapshot = Readonly<{
	source: AudioBuffer;
	clips: ReadonlyArray<AudioClip>;
}>;

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export class AudioDocument extends Subscribable {
	private _source: AudioBuffer;
	private _clips: ReadonlyArray<AudioClip>;
	private _sourcePeaks: ReadonlyArray<Peak> | null = null;
	private _dirty = false;

	constructor(source: AudioBuffer, clips: ReadonlyArray<AudioClip>) {
		super();
		this._source = source;
		this._clips = clips;
	}

	static async load(
		url: string,
		audio: AudioManager,
	): Promise<AudioDocument> {
		const data = await fetch(url).then((response) =>
			response.arrayBuffer(),
		);
		const source = await audio.decode(data);
		return new AudioDocument(source, [
			{
				id: clipId(),
				start: 0,
				sourceOffset: 0,
				duration: source.duration,
			},
		]);
	}

	static empty(sampleRate: number): AudioDocument {
		return new AudioDocument(
			new AudioBuffer({ length: 1, numberOfChannels: 1, sampleRate }),
			[],
		);
	}

	get source(): AudioBuffer {
		return this._source;
	}

	get clips(): ReadonlyArray<AudioClip> {
		return this._clips;
	}

	get sampleRate(): number {
		return this._source.sampleRate;
	}

	get duration(): number {
		return this._clips.reduce(
			(max, clip) => Math.max(max, clip.start + clip.duration),
			0,
		);
	}

	get dirty(): boolean {
		return this._dirty;
	}

	get empty(): boolean {
		return this._clips.length === 0;
	}

	sourcePeaks(): ReadonlyArray<Peak> {
		if (!this._sourcePeaks) {
			const mono = mixToMono(this._source);
			this._sourcePeaks = computePeaks(
				mono,
				Math.min(mono.length, BASE_PEAK_RESOLUTION),
			);
		}
		return this._sourcePeaks;
	}

	clipPeaks(clip: AudioClip): ReadonlyArray<Peak> {
		const peaks = this.sourcePeaks();
		const total = this._source.duration;
		if (total <= 0) {
			return [];
		}
		const from = Math.floor(
			(clip.sourceOffset / total) * peaks.length,
		);
		const to = Math.ceil(
			((clip.sourceOffset + clip.duration) / total) * peaks.length,
		);
		return peaks.slice(
			Math.max(0, from),
			Math.min(peaks.length, Math.max(from + 1, to)),
		);
	}

	splitAt(time: number): void {
		const target = this._clips.find(
			(clip) =>
				time > clip.start && time < clip.start + clip.duration,
		);
		if (!target) {
			return;
		}
		const leftDuration = time - target.start;
		const left: AudioClip = { ...target, duration: leftDuration };
		const right: AudioClip = {
			id: clipId(),
			start: time,
			sourceOffset: target.sourceOffset + leftDuration,
			duration: target.duration - leftDuration,
		};
		this.setClips(
			this._clips.flatMap((clip) =>
				clip.id === target.id ? [left, right] : [clip],
			),
		);
	}

	moveClip(id: string, desiredStart: number): void {
		const clip = this._clips.find((c) => c.id === id);
		if (!clip) {
			return;
		}
		const others = [...this._clips]
			.filter((c) => c.id !== id)
			.sort((a, b) => a.start - b.start);
		const left = others.filter((c) => c.start <= clip.start).at(-1);
		const right = others.find((c) => c.start > clip.start);
		const min = left ? left.start + left.duration : 0;
		const max = right ? right.start - clip.duration : Infinity;
		const start = clamp(
			desiredStart,
			Math.max(0, min),
			Math.max(min, max),
		);
		this.replaceClip(id, { start });
	}

	trimStart(id: string, newStart: number): void {
		const clip = this._clips.find((c) => c.id === id);
		if (!clip) {
			return;
		}
		const others = [...this._clips]
			.filter((c) => c.id !== id)
			.sort((a, b) => a.start - b.start);
		const left = others.filter((c) => c.start <= clip.start).at(-1);
		const leftEnd = left ? left.start + left.duration : 0;
		const lower = Math.max(leftEnd, clip.start - clip.sourceOffset);
		const upper = clip.start + clip.duration - MIN_CLIP_DURATION;
		const start = clamp(newStart, lower, upper);
		const delta = start - clip.start;
		this.replaceClip(id, {
			start,
			sourceOffset: clip.sourceOffset + delta,
			duration: clip.duration - delta,
		});
	}

	trimEnd(id: string, newDuration: number): void {
		const clip = this._clips.find((c) => c.id === id);
		if (!clip) {
			return;
		}
		const others = [...this._clips]
			.filter((c) => c.id !== id)
			.sort((a, b) => a.start - b.start);
		const right = others.find((c) => c.start > clip.start);
		const maxBySource = this._source.duration - clip.sourceOffset;
		const maxByNeighbor = right ? right.start - clip.start : Infinity;
		const duration = clamp(
			newDuration,
			MIN_CLIP_DURATION,
			Math.min(maxBySource, maxByNeighbor),
		);
		this.replaceClip(id, { duration });
	}

	removeClip(id: string): void {
		this.setClips(this._clips.filter((clip) => clip.id !== id));
	}

	setSource(source: AudioBuffer): void {
		this._source = source;
		this._sourcePeaks = null;
		this._clips = [
			{
				id: clipId(),
				start: 0,
				sourceOffset: 0,
				duration: source.duration,
			},
		];
		this.markDirty();
	}

	setClips(clips: ReadonlyArray<AudioClip>): void {
		this._clips = [...clips].sort((a, b) => a.start - b.start);
		this.markDirty();
	}

	snapshot(): DocumentSnapshot {
		return { source: this._source, clips: this._clips };
	}

	restore(snapshot: DocumentSnapshot): void {
		if (snapshot.source !== this._source) {
			this._source = snapshot.source;
			this._sourcePeaks = null;
		}
		this._clips = snapshot.clips;
		this.markDirty();
	}

	renderArrangement(): AudioBuffer {
		const sampleRate = this._source.sampleRate;
		const channels = this._source.numberOfChannels;
		const length = Math.max(
			1,
			Math.round(this.duration * sampleRate),
		);
		const out = new AudioBuffer({
			length,
			numberOfChannels: channels,
			sampleRate,
		});
		for (const clip of this._clips) {
			const srcStart = Math.round(clip.sourceOffset * sampleRate);
			const dstStart = Math.round(clip.start * sampleRate);
			const count = Math.min(
				Math.round(clip.duration * sampleRate),
				this._source.length - srcStart,
				length - dstStart,
			);
			if (count <= 0) {
				continue;
			}
			for (let c = 0; c < channels; c++) {
				const src = this._source.getChannelData(c);
				out
					.getChannelData(c)
					.set(src.subarray(srcStart, srcStart + count), dstStart);
			}
		}
		return out;
	}

	markSaved(): void {
		this._dirty = false;
		this.notify();
	}

	toBlob(): Blob {
		return new Blob([encodeWav(this.renderArrangement())], {
			type: "audio/wav",
		});
	}

	private replaceClip(id: string, patch: Partial<AudioClip>): void {
		this.setClips(
			this._clips.map((clip) =>
				clip.id === id ? { ...clip, ...patch } : clip,
			),
		);
	}

	private markDirty(): void {
		this._dirty = true;
		this.notify();
	}
}
