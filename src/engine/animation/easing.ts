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

export const ease = (name: string): EasingFn =>
	easings[name as EasingName] ?? easings.linear;
