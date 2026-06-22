import type { EntityId } from "../ecs";
import type { World } from "../world";
import {
	serializableType,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { reconstruct } from "./value";

export const deserializeEntity = (
	world: World,
	entity: SerializedEntity,
): EntityId => {
	const components: object[] = [];
	for (const [name, data] of Object.entries(entity.components)) {
		const type = serializableType(name);
		if (!type) {
			continue;
		}
		components.push(reconstruct(type, data));
	}
	return world.ecs.createEntity(components, entity.id as EntityId);
};

export const deserializeWorld = (
	world: World,
	entities: SerializedWorld,
): void => {
	for (const entity of entities) {
		deserializeEntity(world, entity);
	}
};
