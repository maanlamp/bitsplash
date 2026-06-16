import type { EntityId } from "../ecs";
import type { World } from "../world";
import { isSkipField } from "./field-enums";
import {
	type ComponentClass,
	componentClass,
	type SerializedComponent,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { decodeValue } from "./value";

const reviveDefault = (
	typeName: string,
	ctor: ComponentClass,
	data: SerializedComponent,
): object => {
	const instance = new (ctor as new () => Record<string, unknown>)();
	for (const [key, value] of Object.entries(data)) {
		if (isSkipField(typeName, key)) {
			continue;
		}
		instance[key] = decodeValue(value);
	}
	return instance;
};

export const deserializeEntity = (
	world: World,
	entity: SerializedEntity,
): EntityId => {
	const components: object[] = [];
	for (const [typeName, data] of Object.entries(entity.components)) {
		const ctor = componentClass(typeName);
		if (!ctor) {
			continue;
		}
		components.push(reviveDefault(typeName, ctor, data));
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
