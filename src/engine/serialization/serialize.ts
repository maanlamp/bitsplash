import type { EntityId, ReadonlyECS } from "../ecs";
import {
	componentTypeName,
	type SerializedComponent,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { encodeValue } from "./value";

const serializeComponent = (
	component: object,
): SerializedComponent => {
	const out: SerializedComponent = {};
	for (const [key, value] of Object.entries(component)) {
		const encoded = encodeValue(value);
		if (encoded !== undefined) {
			out[key] = encoded;
		}
	}
	return out;
};

export const serializeEntity = (
	ecs: ReadonlyECS,
	id: EntityId,
): SerializedEntity | null => {
	const components: Record<string, SerializedComponent> = {};
	let any = false;
	for (const component of ecs.componentsOf(id)) {
		const typeName = componentTypeName(component);
		if (!typeName) {
			continue;
		}
		components[typeName] = serializeComponent(component);
		any = true;
	}
	return any ? { id, components } : null;
};

export const serializeWorld = (ecs: ReadonlyECS): SerializedWorld =>
	ecs
		.entities()
		.map((id) => serializeEntity(ecs, id))
		.filter((entity): entity is SerializedEntity => entity !== null);
