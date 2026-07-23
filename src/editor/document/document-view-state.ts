/** A sprite-editor camera pose in world units: pan centre + zoom factor. */
export type CameraPose = Readonly<{
	x: number;
	y: number;
	zoom: number;
}>;

/** A timeline scroll offset in CSS pixels. */
export type TimelineScroll = Readonly<{ left: number; top: number }>;

/**
 * The transient, per-view "declared view-state" that must survive a cross-window
 * move — a **remount** that rebuilds the WebGL canvas and every child component
 * (plan lines 54-58). It is deliberately not the document: losing it degrades
 * gracefully (the view re-fits), so it lives beside the document in the
 * {@link DocumentEntry} rather than inside it.
 *
 * Every field defaults to `null` and is written only once its owning component
 * observes a real value. Consumers restore **only** from a non-null field, so a
 * fresh view (never previously mounted) behaves exactly as before this store
 * existed — it fits/auto-scrolls — and a remounted view restores what the prior
 * mount last wrote.
 */
export class DocumentViewState {
	private _camera: CameraPose | null = null;
	private _timelineScroll: TimelineScroll | null = null;
	private _trackHeight: number | null = null;

	/** The sprite canvas camera pose, or `null` until one has been recorded. */
	get camera(): CameraPose | null {
		return this._camera;
	}

	setCamera(pose: CameraPose): void {
		this._camera = pose;
	}

	/** Forget the recorded camera pose so the next mount re-fits the bounds. */
	clearCamera(): void {
		this._camera = null;
	}

	/** The timeline scroll offset, or `null` until the timeline has scrolled. */
	get timelineScroll(): TimelineScroll | null {
		return this._timelineScroll;
	}

	setTimelineScroll(scroll: TimelineScroll): void {
		this._timelineScroll = scroll;
	}

	/** The audio timeline track height in pixels, or `null` for the default. */
	get trackHeight(): number | null {
		return this._trackHeight;
	}

	setTrackHeight(height: number): void {
		this._trackHeight = height;
	}
}
