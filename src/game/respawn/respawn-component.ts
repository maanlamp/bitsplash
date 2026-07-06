import { Duration } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import { EntityRef } from "../../engine/entity-ref";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Respawn")
export class RespawnComponent {
	@serialize({ group: "spawn" }) delay: Duration;
	@serialize({ group: "spawn" }) spawnPoint: EntityRef;

	constructor(delay: number = 6, spawnPoint: EntityId | null = null) {
		this.delay = new Duration(delay);
		this.spawnPoint = new EntityRef(spawnPoint);
	}
}
