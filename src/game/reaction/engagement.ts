import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { TransformComponent } from "../../engine/transform-component";

/**
 * Horizontal distance below which two entities count as sharing a spot, in
 * pixels. `Math.sign(0)` is `0` and matches no facing direction, so without this
 * an entity standing exactly on top of another would read as engaging neither
 * way.
 */
const OVERLAP = 1;

/**
 * Whether `other` is engaging `actor`: looking at it, walking at it, or standing
 * on it.
 *
 * A perceiver's own cone answers "can I see them?", which is not the same
 * question as "are they here for me?" — walking through the far end of an NPC's
 * cone on the way somewhere else is not an approach, and an NPC that greets it
 * is the reason barks felt constant. This is the second half of that test, read
 * off the *other* entity's orientation rather than the perceiver's.
 *
 * An entity with neither facing nor movement intent can engage nothing: a
 * signpost does not walk up to people.
 *
 * @example
 * if (isEngaging(ecs, npcId, playerId)) out.add("noticed-friendly");
 */
export const isEngaging = (
	ecs: ReadonlyECS,
	actor: EntityId,
	other: EntityId,
): boolean => {
	const here = ecs.getComponent(actor, TransformComponent);
	const there = ecs.getComponent(other, TransformComponent);
	if (!here || !there) {
		return false;
	}
	const dx = here.position.x - there.position.x;
	if (Math.abs(dx) <= OVERLAP) {
		return true;
	}
	const toward = Math.sign(dx);
	const facing = ecs.getComponent(other, FacingComponent);
	if (facing !== undefined && Math.sign(facing.dir) === toward) {
		return true;
	}
	const intent = ecs.getComponent(other, MovementIntentComponent);
	return (
		intent !== undefined &&
		intent.moveX !== 0 &&
		Math.sign(intent.moveX) === toward
	);
};
