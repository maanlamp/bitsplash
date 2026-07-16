/**
 * Per-world profiling sink holding the **current frame's** update timings only.
 *
 * History, ring buffers, and windowed averaging live editor-side; this type is
 * the minimal contract the editor's overlay widgets and profiler view consume.
 * The map and its group table are reused across frames so a profiled frame
 * performs no per-frame allocation beyond the map's own entry churn.
 *
 * @example
 * const profile = new FrameProfile();
 * ecs.setProfile(profile);
 * ecs.update(ctx);
 * profile.updateSpanMs; // total ecs.update() wall-clock span, ms
 * profile.systemTimings.get("Physics"); // that system's self-time, ms
 */
export class FrameProfile {
	/** Wall-clock span of the most recent `ecs.update()`, in milliseconds. */
	updateSpanMs = 0;

	private readonly timings = new Map<string, number>();
	private readonly groups = new Map<string, string | undefined>();

	/**
	 * Clear the current frame's per-system timings and span, keeping the map's
	 * capacity. Called by {@link ECS.update} at the start of each profiled frame.
	 */
	reset(): void {
		this.timings.clear();
		this.updateSpanMs = 0;
	}

	/**
	 * Record a system's self-time for this frame under its resolved label. The
	 * label's group is remembered across frames (labels are stable per world).
	 */
	record(label: string, ms: number, group?: string): void {
		this.timings.set(label, ms);
		if (!this.groups.has(label)) {
			this.groups.set(label, group);
		}
	}

	/** The per-system self-times recorded this frame (label → ms). */
	get systemTimings(): ReadonlyMap<string, number> {
		return this.timings;
	}

	/** The `@profiler` group a label belongs to, if any. */
	groupOf(label: string): string | undefined {
		return this.groups.get(label);
	}
}
