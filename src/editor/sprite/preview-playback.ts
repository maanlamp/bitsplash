import type { BspriteTag } from "../../engine/sprite/bsprite-manifest";

/**
 * The frame range the live preview is playing: `[from, to]` inclusive plus the
 * `loop` flag, and the `name` of the tag it came from (`null` when no tag
 * applies and the whole document is being played).
 */
export type PreviewRange = Readonly<{
	from: number;
	to: number;
	loop: boolean;
	name: string | null;
}>;

/**
 * The preview's own playback cursor — independent of the editor's active frame.
 * `frame` is the absolute frame index; `elapsed` is milliseconds accumulated on
 * the current frame; `finished` latches when a non-looping range reaches its end.
 */
export type PlaybackState = Readonly<{
	frame: number;
	elapsed: number;
	finished: boolean;
}>;

/**
 * Choose the range the preview should play for a given editing cursor: the first
 * tag whose `[from, to]` contains `activeFrame`, or — when no tag applies — the
 * whole document (`0..frameCount-1`, looping). Mirrors the "play the active
 * tag, else play everything" rule.
 */
export const activePreviewRange = (
	activeFrame: number,
	tags: readonly BspriteTag[],
	frameCount: number,
): PreviewRange => {
	const tag = tags.find(
		(t) => activeFrame >= t.from && activeFrame <= t.to,
	);
	if (tag) {
		return {
			from: tag.from,
			to: tag.to,
			loop: tag.loop,
			name: tag.name,
		};
	}
	return {
		from: 0,
		to: Math.max(0, frameCount - 1),
		loop: true,
		name: null,
	};
};

/**
 * Advance the preview cursor by `dt` milliseconds, honouring per-frame
 * `durations` and the range's `loop` flag — the timing logic of
 * `sprite-tag-playback-system.ts`, factored pure so it is unit-testable and
 * shared by the preview panel's animation loop.
 *
 * - A cursor outside the range snaps to `from` (a range change resets playback).
 * - A single-frame range (`to <= from`) holds on `from` and never advances.
 * - A looping range wraps within `[from, to]`; a non-looping range clamps at
 *   `to` and sets `finished`.
 * - A zero/negative frame duration never advances (no divide-by-zero, no spin).
 */
export const advancePreview = (
	prev: PlaybackState,
	dt: number,
	durations: readonly number[],
	range: PreviewRange,
): PlaybackState => {
	if (range.to <= range.from) {
		return { frame: range.from, elapsed: 0, finished: false };
	}
	let frame =
		prev.frame < range.from || prev.frame > range.to
			? range.from
			: prev.frame;
	let elapsed = prev.elapsed + dt;
	let finished = prev.finished;
	const count = range.to - range.from + 1;
	for (;;) {
		const duration = durations[frame] ?? 0;
		if (duration <= 0 || elapsed < duration) {
			break;
		}
		elapsed -= duration;
		if (range.loop) {
			frame = range.from + ((frame - range.from + 1) % count);
		} else if (frame < range.to) {
			frame += 1;
			if (frame === range.to) {
				finished = true;
			}
		} else {
			elapsed = 0;
			break;
		}
	}
	return { frame, elapsed, finished };
};
