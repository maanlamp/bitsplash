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
import { Easing } from "./easing";

@serializable("Tween")
export class Tween implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() from: number;
	@serialize() to: number;
	@serialize() duration: Duration;
	@serialize() easing: Easing;
	@serialize() elapsed = 0 as Seconds;

	constructor(from = 0, to = 1, duration = 0.3, easing = "linear") {
		this.from = from;
		this.to = to;
		this.duration = new Duration(duration);
		this.easing = new Easing(easing);
	}

	tick(dt: Milliseconds): void {
		this.elapsed = Math.min(
			this.duration.seconds,
			this.elapsed + dt / 1000,
		) as Seconds;
	}

	progress(): number {
		return this.duration.seconds > 0
			? this.elapsed / this.duration.seconds
			: 1;
	}

	value(): number {
		return (
			this.from +
			(this.to - this.from) * this.easing.fn()(this.progress())
		);
	}

	done(): boolean {
		return this.elapsed >= this.duration.seconds;
	}

	retarget(
		from: number,
		to: number,
		duration: number,
		easing: string,
	): void {
		this.from = from;
		this.to = to;
		this.duration.set(duration);
		this.easing.set(easing);
		this.elapsed = 0 as Seconds;
	}
}
