/**
 * The mixing tree everything audible hangs from.
 *
 * A bus is a `userGain -> systemGain` pair with a parent. The split is the whole
 * point: **settings write `userGain`, the system writes `systemGain`**, so focus
 * gating, pause and ducking can never overwrite a level the player chose.
 *
 * ```
 * destination
 * └─ master                                  ← master volume
 *    ├─ editor main
 *    │  ├─ scene view bus (one per view)     ← per-view mute
 *    │  │  └─ world routing bus              ← audio-focus gate
 *    │  │     └─ ambience | sfx | voice      ← category volumes
 *    │  └─ asset preview bus                 ← never gated by a scene view
 *    └─ game
 *       └─ world routing bus                 ← audio-focus gate, pause
 *          └─ ambience | sfx | voice         ← category volumes
 * ```
 *
 * Focus gates the **world routing** buses, not master — a blurred realm silences
 * the worlds it hosts while the tree above them is left alone.
 *
 * Buses are written **only on state change**, never per frame, which is what
 * makes the one scheduled event in {@link AudioBus.mute} safe. Per-frame
 * parameters live on voices and use `setTargetAtTime` exclusively.
 */

/** A node in the mixing tree. Sources and child buses feed its input. */
export type AudioBus = Readonly<{
	/** Set the player-chosen level. Nothing system-driven may call this. */
	setUserGain: (gain: number) => void;
	/** Set the system-driven level (focus, pause, ducking). */
	setSystemGain: (gain: number, timeConstant?: number) => void;
	/** Gate this bus fully off or back on, with residual cleanup on the way down. */
	mute: (muted: boolean) => void;
	createChild: () => AudioBus;
	dispose: () => void;
}>;

/**
 * The volume categories a player controls. There is no Music category — the
 * project has no music, so a Music control would control nothing.
 */
export const AUDIO_CATEGORIES = ["ambience", "sfx", "voice"] as const;

export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

/** One bus per category, hung under a common parent. */
export type AudioBusSet = Readonly<Record<AudioCategory, AudioBus>>;

/** Time constant of an ordinary bus gain move, in seconds. */
const BUS_TAU = 0.05;

/** Time constant of a mute or unmute, in seconds. */
const MUTE_TAU = 0.06;

/**
 * Multiples of the mute time constant after which the tail is snapped to zero.
 *
 * `setTargetAtTime` is exponential and never actually reaches its target, so a
 * muted bus would otherwise idle forever at an inaudible but non-zero gain. At
 * five time constants the residual is under 0.7%, so the snap is silent.
 */
const RESIDUAL_TAUS = 5;

const inputs = new WeakMap<AudioBus, GainNode>();

/**
 * The node a source should connect to in order to play on `bus`.
 *
 * Engine-internal: it exists so `AudioManager` can route a source at a bus
 * without exposing its `AudioContext` or its nodes to callers.
 */
export const busInput = (bus: AudioBus): GainNode | undefined =>
	inputs.get(bus);

/**
 * Build a bus feeding `destination`.
 *
 * @example
 * const master = createWebAudioBus(ctx, ctx.destination);
 * const game = master.createChild();
 */
export const createWebAudioBus = (
	ctx: BaseAudioContext,
	destination: AudioNode,
): AudioBus => {
	const userGain = new GainNode(ctx, { gain: 1 });
	const systemGain = new GainNode(ctx, { gain: 1 });
	userGain.connect(systemGain).connect(destination);

	const children = new Set<AudioBus>();
	let disposed = false;

	const bus: AudioBus = {
		setUserGain: (gain) => {
			if (disposed) {
				return;
			}
			userGain.gain.setTargetAtTime(gain, ctx.currentTime, BUS_TAU);
		},
		setSystemGain: (gain, timeConstant = BUS_TAU) => {
			if (disposed) {
				return;
			}
			const now = ctx.currentTime;
			systemGain.gain.cancelScheduledValues(now);
			systemGain.gain.setTargetAtTime(
				gain,
				now,
				Math.max(0.001, timeConstant),
			);
		},
		mute: (muted) => {
			if (disposed) {
				return;
			}
			const now = ctx.currentTime;
			systemGain.gain.cancelScheduledValues(now);
			systemGain.gain.setTargetAtTime(muted ? 0 : 1, now, MUTE_TAU);
			if (muted) {
				systemGain.gain.setValueAtTime(
					0,
					now + RESIDUAL_TAUS * MUTE_TAU,
				);
			}
		},
		createChild: () => {
			const child = createWebAudioBus(ctx, userGain);
			children.add(child);
			return child;
		},
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			for (const child of children) {
				child.dispose();
			}
			children.clear();
			inputs.delete(bus);
			userGain.disconnect();
			systemGain.disconnect();
		},
	};
	inputs.set(bus, userGain);
	return bus;
};

/**
 * One child bus per {@link AUDIO_CATEGORIES} entry, hung under `parent`.
 *
 * Disposing `parent` disposes the whole set, which is how a world's sounds die
 * with the world.
 */
export const createBusSetUnder = (parent: AudioBus): AudioBusSet =>
	Object.fromEntries(
		AUDIO_CATEGORIES.map((category) => [
			category,
			parent.createChild(),
		]),
	) as unknown as AudioBusSet;
