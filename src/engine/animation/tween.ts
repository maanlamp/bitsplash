import type { Milliseconds, Seconds } from "../duration";
import { valueType } from "../serialization/value-type";
import { ease } from "./easing";

@valueType()
export class Tween {
	from: number;
	to: number;
	duration: Seconds;
	easing: string;
	elapsed = 0 as Seconds;

	constructor(
		from = 0,
		to = 1,
		duration = 0.3 as Seconds,
		easing = "linear",
	) {
		this.from = from;
		this.to = to;
		this.duration = duration;
		this.easing = easing;
	}

	tick(dt: Milliseconds): void {
		this.elapsed = Math.min(
			this.duration,
			this.elapsed + dt / 1000,
		) as Seconds;
	}

	progress(): number {
		return this.duration > 0 ? this.elapsed / this.duration : 1;
	}

	value(): number {
		return (
			this.from +
			(this.to - this.from) * ease(this.easing)(this.progress())
		);
	}

	done(): boolean {
		return this.elapsed >= this.duration;
	}

	retarget(
		from: number,
		to: number,
		duration: Seconds,
		easing: string,
	): void {
		this.from = from;
		this.to = to;
		this.duration = duration;
		this.easing = easing;
		this.elapsed = 0 as Seconds;
	}
}
