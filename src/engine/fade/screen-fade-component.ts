import type { Tween } from "../animation/tween";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("ScreenFade")
export class ScreenFadeComponent {
	@serialize() alpha: number;
	tween: Tween | null = null;

	constructor(alpha = 0) {
		this.alpha = alpha;
	}
}
