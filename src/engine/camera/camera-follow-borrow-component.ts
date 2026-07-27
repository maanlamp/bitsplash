import type { EntityId } from "../ecs";
import { EntityRef } from "../entity-ref";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

/**
 * The gameplay camera-follow state a cutscene borrowed, plus the entity that
 * borrowed it. Attached to the camera entity the moment an exclusive sequence
 * first drives the camera (see `borrowCameraFollow`) and consumed by
 * {@link Camera2DFollowSystem} once `owner` is gone, which is what makes camera
 * control sequence-scoped: a cutscene can frame whatever it likes and can never
 * leave the camera stranded on a prop, or following nothing, after it ends.
 *
 * A cutscene chained onto another (a queued exclusive sequence) inherits the
 * borrow, so the camera returns to the pre-cutscene state once the whole chain
 * finishes rather than to an intermediate framing.
 */
@serializable("CameraFollowBorrow")
export class CameraFollowBorrowComponent {
	@serialize() owner: EntityRef;
	@serialize() targets: EntityId[];
	@serialize() zoom: number;

	constructor(
		owner: EntityId | null = null,
		targets: ReadonlyArray<EntityId> = [],
		zoom: number = 1,
	) {
		this.owner = new EntityRef(owner);
		this.targets = [...targets];
		this.zoom = zoom;
	}
}
