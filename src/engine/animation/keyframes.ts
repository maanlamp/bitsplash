import type { MutableRGBA, RGBA } from "../render/color-resolver";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type SerializableValue,
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";
import { Ease } from "./ease";

/**
 * One key of a {@link Keyframes} track: a value pinned at normalized time `t`,
 * plus the {@link Ease} that shapes the segment **starting** at this key (the
 * CSS keyframe convention). The last key's ease is unused.
 */
export type Keyframe<T extends SerializableValue> = Readonly<{
	t: number;
	value: T;
	ease: Ease;
}>;

/**
 * Build a {@link Keyframe}. Plain data — keys are never mutated, and a frozen
 * {@link Ease} preset can be shared across as many keys as you like.
 *
 * @example
 * new KeyframesNumber([keyframe(0, 0, Ease.OutBack), keyframe(1, 1)]);
 */
export const keyframe = <T extends SerializableValue>(
	t: number,
	value: T,
	ease: Ease = Ease.Linear,
): Keyframe<T> => ({ t, value, ease });

const assertOrdered = (
	keys: ReadonlyArray<Keyframe<SerializableValue>>,
): void => {
	for (let i = 1; i < keys.length; i++) {
		if (keys[i]!.t < keys[i - 1]!.t) {
			throw new Error(
				`Keyframes: keys must be in ascending time order, got ${keys[i - 1]!.t} before ${keys[i]!.t}`,
			);
		}
	}
};

/**
 * A stateless keyframed track sampled by normalized time.
 *
 * Tracks are shared definition data — nothing about a running animation lives
 * here, so one track instance serves every particle or entity reading it; the
 * only per-instance state a consumer keeps is its own age or phase scalar.
 *
 * Sampling is **unclamped**: an overshooting segment ease returns values
 * outside the two keys it interpolates, which is load-bearing for punchy
 * scale/alpha curves. Outside the key range the endpoint values hold.
 *
 * Interpolation is a per-type strategy supplied by a concrete subclass, which
 * is also the serialization unit — functions do not round-trip, so tracks
 * persist as {@link KeyframesNumber} / {@link KeyframesColor} rather than as a
 * generic type carrying a lerp callback.
 */
export abstract class Keyframes<
	T extends SerializableValue,
> implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() keys: ReadonlyArray<Keyframe<T>>;

	constructor(keys: ReadonlyArray<Keyframe<T>> = []) {
		assertOrdered(keys);
		this.keys = keys;
	}

	/**
	 * Value at normalized time `t`, holding the endpoints outside the key
	 * range and never clamping the interpolated result.
	 *
	 * @throws if the track has no keys.
	 */
	sample(t: number): T {
		const index = this.segmentIndex(t);
		if (index < 0) {
			return t <= this.keys[0]!.t
				? this.keys[0]!.value
				: this.keys[this.keys.length - 1]!.value;
		}
		return this.interpolate(
			this.keys[index]!.value,
			this.keys[index + 1]!.value,
			this.segmentPhase(index, t),
		);
	}

	/**
	 * Index of the key that starts the segment containing `t`, or `-1` when `t`
	 * sits at or outside an endpoint and that endpoint's value holds.
	 *
	 * Split out of {@link sample} so a zero-allocation variant can reuse the
	 * search without duplicating it. Returns an index rather than the keys so
	 * neither path allocates.
	 *
	 * @throws if the track has no keys.
	 */
	protected segmentIndex(t: number): number {
		const keys = this.keys;
		if (keys.length === 0) {
			throw new Error("Keyframes: cannot sample, track has no keys");
		}
		if (t <= keys[0]!.t || t >= keys[keys.length - 1]!.t) {
			return -1;
		}
		let index = 0;
		while (index < keys.length - 2 && keys[index + 1]!.t <= t) {
			index++;
		}
		return index;
	}

	/** Eased phase of `t` within the segment starting at `index`. */
	protected segmentPhase(index: number, t: number): number {
		const from = this.keys[index]!;
		const span = this.keys[index + 1]!.t - from.t;
		return from.ease.at(span > 0 ? (t - from.t) / span : 1);
	}

	protected abstract interpolate(from: T, to: T, phase: number): T;
}

/** A scalar track: alpha, scale, rotation, emission rate. */
@serializable("KeyframesNumber")
export class KeyframesNumber extends Keyframes<number> {
	/** The two-key case, e.g. the track behind a tween. */
	static fromTo(
		from: number,
		to: number,
		ease: Ease = Ease.Linear,
	): KeyframesNumber {
		return new KeyframesNumber([
			keyframe(0, from, ease),
			keyframe(1, to),
		]);
	}

	protected interpolate(
		from: number,
		to: number,
		phase: number,
	): number {
		return from + (to - from) * phase;
	}
}

/**
 * A colour track over premultiply-free straight sRGB components in `[0, 1]`,
 * alpha included.
 *
 * Keys hold numeric {@link RGBA} rather than css strings so sampling costs no
 * parsing, and the interpolation space is an implementation detail of
 * {@link KeyframesColor.interpolate}: moving to a perceptual space converts in
 * and out here, leaving authored data untouched.
 */
@serializable("KeyframesColor")
export class KeyframesColor extends Keyframes<RGBA> {
	/**
	 * {@link Keyframes.sample} into a caller-owned tuple, allocating nothing.
	 *
	 * `sample` returns a fresh {@link RGBA} per call, which a particle hot loop
	 * sampling a colour per particle per frame cannot afford. Reuse one scratch
	 * tuple across the loop and read it out before the next call.
	 *
	 * @example
	 * const tint: MutableRGBA = [1, 1, 1, 1];
	 * track.sampleInto(age / life, tint);
	 */
	sampleInto(t: number, out: MutableRGBA): void {
		const index = this.segmentIndex(t);
		if (index < 0) {
			const key =
				t <= this.keys[0]!.t
					? this.keys[0]!
					: this.keys[this.keys.length - 1]!;
			out[0] = key.value[0];
			out[1] = key.value[1];
			out[2] = key.value[2];
			out[3] = key.value[3];
			return;
		}
		const from = this.keys[index]!.value;
		const to = this.keys[index + 1]!.value;
		const phase = this.segmentPhase(index, t);
		out[0] = from[0] + (to[0] - from[0]) * phase;
		out[1] = from[1] + (to[1] - from[1]) * phase;
		out[2] = from[2] + (to[2] - from[2]) * phase;
		out[3] = from[3] + (to[3] - from[3]) * phase;
	}

	protected interpolate(from: RGBA, to: RGBA, phase: number): RGBA {
		return [
			from[0] + (to[0] - from[0]) * phase,
			from[1] + (to[1] - from[1]) * phase,
			from[2] + (to[2] - from[2]) * phase,
			from[3] + (to[3] - from[3]) * phase,
		];
	}
}
