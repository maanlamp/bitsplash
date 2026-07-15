import type { EntityId, ReadonlyECS } from "../ecs";
import {
	serializableTypeOf,
	type SerializedComponent,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { walkFields } from "./value";

/**
 * Encode live component instances into the `{ TypeName: fields }` shape a
 * {@link SerializedEntity} carries — the same form {@link serializeEntity}
 * produces from an ECS, but for components that never entered a world. Used by
 * pure `SceneFile → SceneFile` migrations that synthesize entities.
 *
 * @throws if any component's class is not `@serializable`.
 * @example
 * const entity = { id, components: encodeComponents([new RenderLayersComponent()]) };
 */
export const encodeComponents = (
	components: ReadonlyArray<object>,
): Record<string, SerializedComponent> => {
	const out: Record<string, SerializedComponent> = {};
	for (const component of components) {
		const type = serializableTypeOf(component);
		if (!type) {
			throw new Error(
				`encodeComponents: ${component.constructor.name} is not @serializable`,
			);
		}
		out[type.name] = walkFields(type, component);
	}
	return out;
};

// Serialization has one product shape and no provenance filter. A scene file is
// only ever produced by replaying the edit journal onto a file-derived baseline
// in a scratch world that has never simulated (see SceneDocument.save); no live
// world is ever serialized into a scene document, so component-type provenance
// has nothing left to guard. Runtime snapshots (save-games, scene freeze/thaw,
// mid-cutscene resume) serialize any live world whole — cameras, fades, and
// sequence run-state included.
export const serializeEntity = (
	ecs: ReadonlyECS,
	id: EntityId,
): SerializedEntity | null => {
	const components: Record<string, SerializedComponent> = {};
	let any = false;
	for (const component of ecs.componentsOf(id)) {
		const type = serializableTypeOf(component);
		if (!type) {
			continue;
		}
		components[type.name] = walkFields(type, component);
		any = true;
	}
	return any ? { id, components } : null;
};

export const serializeWorld = (
	ecs: ReadonlyECS,
	predicate?: (id: EntityId) => boolean,
): SerializedWorld =>
	ecs
		.entities()
		.filter((id) => !predicate || predicate(id))
		.map((id) => serializeEntity(ecs, id))
		.filter((entity): entity is SerializedEntity => entity !== null);
