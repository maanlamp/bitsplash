import type { AudioBus } from "./audio-bus";

/**
 * A bus with no `AudioContext` behind it that still models the tree.
 *
 * It is the reason the bus tree can be asserted at all: WebAudio does not exist
 * headlessly and audio cannot be judged by ear in a test, so the null backend
 * records exactly what the real one would apply — parentage, the two gains, and
 * disposal — and a test reads the model instead of the sound.
 *
 * @example
 * const audio = new NullAudioManager();
 * const view = audio.createBus();
 * view.mute(true);
 * nullBus(view).effectiveGain(); // 0
 */
export class NullAudioBus implements AudioBus {
	userGain = 1;
	systemGain = 1;
	disposed = false;
	readonly children: NullAudioBus[] = [];

	constructor(readonly parent: NullAudioBus | null = null) {}

	setUserGain = (gain: number): void => {
		if (!this.disposed) {
			this.userGain = gain;
		}
	};

	setSystemGain = (gain: number): void => {
		if (!this.disposed) {
			this.systemGain = gain;
		}
	};

	mute = (muted: boolean): void => {
		this.setSystemGain(muted ? 0 : 1);
	};

	createChild = (): AudioBus => {
		const child = new NullAudioBus(this);
		this.children.push(child);
		return child;
	};

	dispose = (): void => {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const child of this.children.splice(0)) {
			child.dispose();
		}
		const siblings = this.parent?.children;
		const at = siblings?.indexOf(this) ?? -1;
		if (siblings && at >= 0) {
			siblings.splice(at, 1);
		}
	};

	/** This bus's own contribution: the two gains multiplied. */
	get gain(): number {
		return this.userGain * this.systemGain;
	}

	/** The gain a source on this bus is heard at, all ancestors included. */
	effectiveGain(): number {
		let gain = this.gain;
		for (let node = this.parent; node !== null; node = node.parent) {
			gain *= node.gain;
		}
		return gain;
	}
}

/**
 * Read a bus as its null-backend model, for tests.
 *
 * Throws rather than returning `null` on a real bus: a test that reaches for the
 * model and silently gets nothing would assert nothing.
 */
export const nullBus = (bus: AudioBus): NullAudioBus => {
	if (!(bus instanceof NullAudioBus)) {
		throw new Error("nullBus: not a null-backend bus");
	}
	return bus;
};
