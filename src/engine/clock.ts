import type { Milliseconds, Seconds } from "./duration";

export type Time = Readonly<{
	elapsed: Seconds;
	dt: Seconds;
	scale: number;
}>;

export class Clock {
	private elapsedMs = 0;
	scale = 1;

	advance(deltaMs: Milliseconds): void {
		this.elapsedMs += deltaMs * this.scale;
	}

	snapshot(deltaMs: Milliseconds): Time {
		return {
			elapsed: (this.elapsedMs / 1000) as Seconds,
			dt: ((deltaMs * this.scale) / 1000) as Seconds,
			scale: this.scale,
		};
	}
}
