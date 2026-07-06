import {
	Duration,
	type Milliseconds,
	type Seconds,
} from "../duration";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";
import { ease } from "./easing";

@serializable("FadeTimeline")
export class FadeTimeline implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() fadeIn: Duration;
	@serialize() hold: Duration;
	@serialize() fadeOut: Duration;
	elapsed = 0 as Seconds;

	constructor(fadeIn = 0.5, hold = 1.5, fadeOut = 0.5) {
		this.fadeIn = new Duration(fadeIn);
		this.hold = new Duration(hold);
		this.fadeOut = new Duration(fadeOut);
	}

	total(): Seconds {
		return (this.fadeIn.seconds +
			this.hold.seconds +
			this.fadeOut.seconds) as Seconds;
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
		const fadeIn = this.fadeIn.seconds;
		const hold = this.hold.seconds;
		const fadeOut = this.fadeOut.seconds;
		const elapsed = this.elapsed;
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
