export type Time = Readonly<{
	elapsed: number;
	dt: number;
	scale: number;
}>;

export class Clock {
	private elapsedMs = 0;
	scale = 1;

	advance(deltaMs: number): void {
		this.elapsedMs += deltaMs * this.scale;
	}

	snapshot(deltaMs: number): Time {
		return {
			elapsed: this.elapsedMs / 1000,
			dt: (deltaMs * this.scale) / 1000,
			scale: this.scale,
		};
	}
}
