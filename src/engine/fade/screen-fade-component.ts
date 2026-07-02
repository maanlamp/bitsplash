import type { Tween } from "../animation/tween";

export class ScreenFadeComponent {
	alpha: number;
	tween: Tween | null = null;

	constructor(alpha = 0) {
		this.alpha = alpha;
	}
}
