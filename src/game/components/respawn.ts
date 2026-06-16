import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import { serializable } from "../../engine/serialization/serializable";

@serializable("Respawn")
export class RespawnComponent {
	delay: Seconds;
	spawnPoint: EntityId | null;

	constructor(
		delay: Seconds = 6 as Seconds,
		spawnPoint: EntityId | null = null,
	) {
		this.delay = delay;
		this.spawnPoint = spawnPoint;
	}
}
