import type { Milliseconds, Seconds } from "../duration";
import { valueType } from "../serialization/value-type";
import { ease } from "./easing";

@valueType()
export class FadeTimeline {
	fadeIn: Seconds;
	hold: Seconds;
	fadeOut: Seconds;
	elapsed = 0 as Seconds;

	constructor(
		fadeIn = 0.5 as Seconds,
		hold = 1.5 as Seconds,
		fadeOut = 0.5 as Seconds,
	) {
		this.fadeIn = fadeIn;
		this.hold = hold;
		this.fadeOut = fadeOut;
	}

	total(): Seconds {
		return (this.fadeIn + this.hold + this.fadeOut) as Seconds;
	}

	done(): boolean {
		return this.elapsed >= this.total();
	}

	tick(dt: Milliseconds): void {
		this.elapsed = Math.min(
			this.total(),
			this.elapsed + dt / 1000,
		) as Seconds;
	}

	alpha(): number {
		const { elapsed, fadeIn, hold, fadeOut } = this;
		const ramp = ease("linear");
		if (elapsed < fadeIn) {
			return fadeIn > 0 ? ramp(elapsed / fadeIn) : 1;
		}
		if (elapsed < fadeIn + hold) {
			return 1;
		}
		const into = elapsed - fadeIn - hold;
		return fadeOut > 0 ? 1 - ramp(into / fadeOut) : 0;
	}
}
