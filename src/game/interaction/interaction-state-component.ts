import type { EntityId } from "../../engine/ecs";

export class InteractionStateComponent {
	inRange: EntityId | null = null;
	interactWasHeld = false;
	pressedThisFrame = false;
}
