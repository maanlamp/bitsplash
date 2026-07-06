import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

export type EasingFn = (t: number) => number;

const BACK = 1.70158;

const easings = {
	linear: (t) => t,
	easeInCubic: (t) => t * t * t,
	easeOutCubic: (t) => 1 - (1 - t) ** 3,
	easeInOutCubic: (t) =>
		t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
	easeInBack: (t) => (BACK + 1) * t * t * t - BACK * t * t,
	easeOutBack: (t) =>
		1 + (BACK + 1) * (t - 1) ** 3 + BACK * (t - 1) ** 2,
} satisfies Record<string, EasingFn>;

export type EasingName = keyof typeof easings;

export const easingNames = Object.keys(easings) as EasingName[];

export const ease = (name: string): EasingFn =>
	easings[name as EasingName] ?? easings.linear;

@serializable("Easing")
export class Easing implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() name: string;

	constructor(name: string = "linear") {
		this.name = name;
	}

	set(name: string): void {
		this.name = name;
	}

	fn(): EasingFn {
		return ease(this.name);
	}
}
