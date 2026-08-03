import { Timeline } from "../../engine/animation/timeline";

/**
 * Per-entity run-state for an overhead health bar: the two countdowns that
 * decide whether it shows, and the damped chase value it paints.
 *
 * `displayed` is a damp, not a clock — it eases towards `hp` at a fixed time
 * constant with no end, which is why it stays a bare number while the
 * countdowns are {@link Timeline}s.
 */
export class HealthBarStateComponent {
	displayed: number;
	lastHp: number;
	/** Grace period after a hit before `displayed` starts chasing `hp` down. */
	delay = new Timeline();
	/** How long the bar stays on screen; it fades out over its last second. */
	visible = new Timeline();

	constructor(hp: number) {
		this.displayed = hp;
		this.lastHp = hp;
	}
}
