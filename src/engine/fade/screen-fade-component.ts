import type { Tween } from "../animation/tween";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("ScreenFade", { runtime: true })
export class ScreenFadeComponent {
	@serialize() alpha: number;
	@serialize() tween: Tween | null = null;

	constructor(alpha = 0) {
		this.alpha = alpha;
	}
}
