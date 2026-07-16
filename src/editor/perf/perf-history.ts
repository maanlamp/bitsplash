/** Number of samples retained per series — the rolling window all stats use. */
export const PERF_WINDOW = 120;

/** The metrics a {@link PerfHistory} tracks, one ring buffer each. */
export type PerfSeries = "frametime" | "update" | "heap";

/** Rolling min/avg/max over the window plus the newest sample. */
export type PerfStats = Readonly<{
	min: number;
	avg: number;
	max: number;
	current: number;
}>;

/**
 * Per-scene-view rolling history of the three overlay metrics. Fed once per app
 * frame from the frame loop; read each draw by {@link PerfOverlay}. Uses fixed
 * ring buffers so pushing a frame allocates nothing.
 *
 * `fps` is stored as a scalar (not graphed): it is refresh-clamped by rAF, so it
 * is only meaningful as the FPS widget's headline number.
 */
export class PerfHistory {
	private readonly buffers: Record<PerfSeries, Float32Array> = {
		frametime: new Float32Array(PERF_WINDOW),
		update: new Float32Array(PERF_WINDOW),
		heap: new Float32Array(PERF_WINDOW),
	};
	private head = 0;
	private count = 0;

	/** Newest rAF-derived frames-per-second; the FPS widget's headline value. */
	fps = 0;

	/** Push one frame's samples, advancing the ring by one slot. */
	push(sample: {
		frametime: number;
		update: number;
		heap: number;
		fps: number;
	}): void {
		this.buffers.frametime[this.head] = sample.frametime;
		this.buffers.update[this.head] = sample.update;
		this.buffers.heap[this.head] = sample.heap;
		this.head = (this.head + 1) % PERF_WINDOW;
		if (this.count < PERF_WINDOW) {
			this.count++;
		}
		this.fps = sample.fps;
	}

	/** Number of samples currently held (ramps up to {@link PERF_WINDOW}). */
	get length(): number {
		return this.count;
	}

	/** The ordered-oldest-first sample at window index `i` (`0..length-1`). */
	sampleAt(series: PerfSeries, i: number): number {
		const idx =
			(this.head - this.count + i + PERF_WINDOW * 2) % PERF_WINDOW;
		return this.buffers[series][idx]!;
	}

	/** Rolling min/avg/max/current for a series over the current window. */
	stats(series: PerfSeries): PerfStats {
		if (this.count === 0) {
			return { min: 0, avg: 0, max: 0, current: 0 };
		}
		const buffer = this.buffers[series];
		let min = Infinity;
		let max = 0;
		let sum = 0;
		for (let i = 0; i < this.count; i++) {
			const idx =
				(this.head - this.count + i + PERF_WINDOW * 2) % PERF_WINDOW;
			const v = buffer[idx]!;
			if (v < min) {
				min = v;
			}
			if (v > max) {
				max = v;
			}
			sum += v;
		}
		const currentIdx = (this.head - 1 + PERF_WINDOW) % PERF_WINDOW;
		return {
			min,
			avg: sum / this.count,
			max,
			current: buffer[currentIdx]!,
		};
	}
}
