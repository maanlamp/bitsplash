import type { EntityId } from "../../engine/ecs";
import { serializable } from "../../engine/serialization/serializable";

@serializable("Respawn")
export class RespawnComponent {
	delay: number;
	spawnPoint: EntityId | null;

	constructor(delay: number = 6, spawnPoint: EntityId | null = null) {
		this.delay = delay;
		this.spawnPoint = spawnPoint;
	}
}
