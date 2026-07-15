import type { EntityId } from "../engine/ecs";
import {
	componentClass,
	serializableType,
	serializableTypeName,
} from "../engine/serialization/registry";
import {
	encodeComponents,
	serializeEntity,
} from "../engine/serialization/serialize";
import { walkFields } from "../engine/serialization/value";
import { TILE_SIZE } from "../engine/tilemap/tile";
import {
	type FieldValue,
	type JournalEntry,
	walkTo,
} from "./journal-entry";
import type { SceneDocument } from "./scene-document";

export type { FieldValue } from "./journal-entry";

/** Create an authored entity from component instances, journaling the create. */
export const createEntity = (
	document: SceneDocument,
	components: ReadonlyArray<object>,
): EntityId => {
	const id = crypto.randomUUID() as EntityId;
	document.record({
		kind: "entity-create",
		entity: { id, components: encodeComponents(components) },
	});
	return id;
};

/** Delete an entity, capturing its current components so undo can recreate it. */
export const deleteEntity = (
	document: SceneDocument,
	id: EntityId,
): void => {
	const entity = serializeEntity(document.projection, id) ?? {
		id,
		components: {},
	};
	document.record({ kind: "entity-delete", entity });
};

/** Duplicate an entity, offsetting the copy by one tile, journaling the create. */
export const duplicateEntity = (
	document: SceneDocument,
	id: EntityId,
): EntityId | null => {
	const data = serializeEntity(document.projection, id);
	if (!data) {
		return null;
	}
	const components = structuredClone(data.components);
	const transform = components.transform;
	if (transform && typeof transform.position === "object") {
		const position = transform.position as { x: number; y: number };
		position.x += TILE_SIZE;
		position.y += TILE_SIZE;
	}
	const newId = crypto.randomUUID() as EntityId;
	document.record({
		kind: "entity-create",
		entity: { id: newId, components },
	});
	return newId;
};

/** Add a component instance to an entity, journaling the add. */
export const addComponent = (
	document: SceneDocument,
	id: EntityId,
	component: object,
): void => {
	const name = serializableTypeName(component);
	const type = name ? serializableType(name) : null;
	if (!name || !type) {
		return;
	}
	document.record({
		kind: "component-add",
		id,
		type: name,
		data: walkFields(type, component),
	});
};

/** Remove a component from an entity, capturing it so undo can restore it. */
export const removeComponent = (
	document: SceneDocument,
	id: EntityId,
	component: object,
): void => {
	const name = serializableTypeName(component);
	const type = name ? serializableType(name) : null;
	if (!name || !type) {
		return;
	}
	document.record({
		kind: "component-remove",
		id,
		type: name,
		data: walkFields(type, component),
	});
};

/** Move an entity's transform (and physics body) from `before` to `after`. */
export const moveEntity = (
	document: SceneDocument,
	id: EntityId,
	before: Readonly<{ x: number; y: number }>,
	after: Readonly<{ x: number; y: number }>,
): void => {
	if (before.x === after.x && before.y === after.y) {
		return;
	}
	document.record({ kind: "entity-move", id, before, after });
};

type Container = Record<string, unknown>;

type EntryFactory = (
	path: ReadonlyArray<string>,
	before: FieldValue,
	after: FieldValue,
) => JournalEntry;

export type FieldBinding = Readonly<{
	resolve: (
		path: ReadonlyArray<string>,
	) => { container: Container; key: string } | null;
	commit: (path: ReadonlyArray<string>, after: FieldValue) => void;
	record: (
		path: ReadonlyArray<string>,
		before: FieldValue,
		after: FieldValue,
	) => void;
	sub: (prefix: ReadonlyArray<string>) => FieldBinding;
}>;

const makeBinding = (
	document: SceneDocument,
	root: () => Container | null,
	base: ReadonlyArray<string>,
	entry: EntryFactory,
): FieldBinding => {
	const resolve = (path: ReadonlyArray<string>) =>
		walkTo(root(), [...base, ...path]);
	return {
		resolve,
		commit: (path, after) => {
			const t = resolve(path);
			if (!t) {
				return;
			}
			const before = t.container[t.key] as FieldValue;
			if (before === after) {
				return;
			}
			document.record(entry([...base, ...path], before, after));
		},
		record: (path, before, after) => {
			if (before === after) {
				return;
			}
			document.recordApplied(
				entry([...base, ...path], before, after),
			);
		},
		sub: (prefix) =>
			makeBinding(document, root, [...base, ...prefix], entry),
	};
};

/** A field binding onto a component of an authored entity. */
export const entityFieldBinding = (
	document: SceneDocument,
	entity: EntityId,
	componentType: string,
): FieldBinding => {
	const cls = componentClass(componentType);
	return makeBinding(
		document,
		() =>
			cls
				? ((document.projection.getComponent(entity, cls) as
						| Container
						| undefined) ?? null)
				: null,
		[],
		(path, before, after) => ({
			kind: "field-set",
			id: entity,
			type: componentType,
			path,
			before,
			after,
		}),
	);
};

/** A field binding onto the scene config (gravity, ui scale, clear color). */
export const configFieldBinding = (
	document: SceneDocument,
): FieldBinding =>
	makeBinding(
		document,
		() => document.config as unknown as Container,
		[],
		(path, before, after) => ({
			kind: "config-set",
			path,
			before,
			after,
		}),
	);
