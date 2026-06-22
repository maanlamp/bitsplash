import type { EntityId, ReadonlyECS } from "../ecs";
import {
	serializableType,
	serializableTypeName,
	type SerializedComponent,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { walkFields } from "./value";

export const serializeEntity = (
	ecs: ReadonlyECS,
	id: EntityId,
): SerializedEntity | null => {
	const components: Record<string, SerializedComponent> = {};
	let any = false;
	for (const component of ecs.componentsOf(id)) {
		const name = serializableTypeName(component);
		if (!name) {
			continue;
		}
		components[name] = walkFields(serializableType(name)!, component);
		any = true;
	}
	return any ? { id, components } : null;
};

export const serializeWorld = (ecs: ReadonlyECS): SerializedWorld =>
	ecs
		.entities()
		.map((id) => serializeEntity(ecs, id))
		.filter((entity): entity is SerializedEntity => entity !== null);
