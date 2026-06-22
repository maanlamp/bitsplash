import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Respawn")
export class RespawnComponent {
	@serialize() delay: Seconds;
	@serialize() spawnPoint: EntityId | null;

	constructor(
		delay: Seconds = 6 as Seconds,
		spawnPoint: EntityId | null = null,
	) {
		this.delay = delay;
		this.spawnPoint = spawnPoint;
	}
}
