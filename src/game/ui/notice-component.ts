import {
	keyframe,
	KeyframesNumber,
} from "../../engine/animation/keyframes";
import { Timeline } from "../../engine/animation/timeline";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { type NoticeSlot, QUEST_NOTICE_ID } from "./hud-ids";

/**
 * The fade-in / hold / fade-out alpha track for a notice, normalized over the
 * whole run so it can be sampled at the timeline's progress. A run with no
 * duration collapses to its end state rather than dividing by zero.
 */
const envelope = (
	fadeIn: number,
	hold: number,
	fadeOut: number,
): KeyframesNumber => {
	const total = fadeIn + hold + fadeOut;
	const at = (seconds: number): number =>
		total > 0 ? seconds / total : 1;
	return new KeyframesNumber([
		keyframe(0, 0),
		keyframe(at(fadeIn), 1),
		keyframe(at(fadeIn + hold), 1),
		keyframe(1, 0),
	]);
};

/**
 * A transient HUD message: which HUD node it drives, what it says, how long it
 * stays up and how opaque it is while it does.
 *
 * `NoticeSystem` ticks the timeline and destroys the entity once it is
 * `done()`; `HudDynSystem` samples {@link alpha} at the timeline's progress to
 * fade the node named by {@link slot}. A slot whose text is authored in the HUD
 * itself (the death overlay) carries an empty {@link text}.
 *
 * Constructor defaults exist for deserialization only — every field is
 * overwritten on restore.
 *
 * @example
 * ecs.createEntity([
 *   new NoticeComponent(QUEST_NOTICE_ID, "Quest updated", 0.4, 1.2, 0.6),
 * ]);
 */
@serializable("Notice")
export class NoticeComponent {
	@serialize() slot: NoticeSlot;

	@serialize() text: string;

	@serialize() readonly timeline = new Timeline();

	@serialize() alpha = new KeyframesNumber();

	constructor(
		slot: NoticeSlot = QUEST_NOTICE_ID,
		text: string = "",
		fadeIn: number = 0,
		hold: number = 0,
		fadeOut: number = 0,
	) {
		this.slot = slot;
		this.text = text;
		this.timeline.restart(fadeIn + hold + fadeOut);
		this.alpha = envelope(fadeIn, hold, fadeOut);
	}
}
