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
import { TransformComponent } from "../engine/transform-component";
import {
	compositeOf,
	type FieldValue,
	type JournalEntry,
	walkTo,
} from "./journal-entry";
import type { SceneDocument } from "./scene-document";

export type { FieldValue } from "./journal-entry";

/** Record `entries` as one composite journal entry, or nothing if empty. */
const recordComposite = (
	document: SceneDocument,
	entries: JournalEntry[],
): void => {
	const entry = compositeOf(entries);
	if (entry) {
		document.record(entry);
	}
};

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

const deleteEntry = (
	document: SceneDocument,
	id: EntityId,
): JournalEntry => ({
	kind: "entity-delete",
	entity: serializeEntity(document.projection, id) ?? {
		id,
		components: {},
	},
});

/** Delete an entity, capturing its current components so undo can recreate it. */
export const deleteEntity = (
	document: SceneDocument,
	id: EntityId,
): void => {
	document.record(deleteEntry(document, id));
};

/**
 * Delete a set of entities as one composite — a single undo step. A single-id
 * set records a plain delete so trivial deletes stay flat in the journal.
 */
export const deleteEntities = (
	document: SceneDocument,
	ids: Iterable<EntityId>,
): void => {
	const entries = [...ids].map((id) => deleteEntry(document, id));
	recordComposite(document, entries);
};

const duplicateEntry = (
	document: SceneDocument,
	id: EntityId,
): Readonly<{ entry: JournalEntry; newId: EntityId }> | null => {
	const data = serializeEntity(document.projection, id);
	if (!data) {
		return null;
	}
	const components = structuredClone(data.components);
	for (const [name, component] of Object.entries(components)) {
		if (componentClass(name) !== TransformComponent) {
			continue;
		}
		const position = (component as { position?: unknown }).position;
		if (position && typeof position === "object") {
			const p = position as { x: number; y: number };
			p.x += TILE_SIZE;
			p.y += TILE_SIZE;
		}
	}
	const newId = crypto.randomUUID() as EntityId;
	return {
		entry: {
			kind: "entity-create",
			entity: { id: newId, components },
		},
		newId,
	};
};

/** Duplicate an entity, offsetting the copy by one tile, journaling the create. */
export const duplicateEntity = (
	document: SceneDocument,
	id: EntityId,
): EntityId | null => {
	const dup = duplicateEntry(document, id);
	if (!dup) {
		return null;
	}
	document.record(dup.entry);
	return dup.newId;
};

/**
 * Duplicate a set of entities as one composite, offsetting each copy by one
 * tile. Returns the new ids in input order.
 */
export const duplicateEntities = (
	document: SceneDocument,
	ids: Iterable<EntityId>,
): ReadonlyArray<EntityId> => {
	const entries: JournalEntry[] = [];
	const newIds: EntityId[] = [];
	for (const id of ids) {
		const dup = duplicateEntry(document, id);
		if (!dup) {
			continue;
		}
		entries.push(dup.entry);
		newIds.push(dup.newId);
	}
	recordComposite(document, entries);
	return newIds;
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

/** One entity's before/after transform for a group move. */
export type EntityMove = Readonly<{
	id: EntityId;
	before: Readonly<{ x: number; y: number }>;
	after: Readonly<{ x: number; y: number }>;
}>;

/**
 * Move a set of entities as one composite — a single undo step (plan E3). Moves
 * that don't change position are dropped; a lone remaining move records flat.
 * Each `entity-move` teleports the physics body and marks the entity dirty for
 * the pick index on apply, so every moved entity stays consistent.
 */
export const moveEntities = (
	document: SceneDocument,
	moves: ReadonlyArray<EntityMove>,
): void => {
	const entries: JournalEntry[] = moves
		.filter(
			(m) => m.before.x !== m.after.x || m.before.y !== m.after.y,
		)
		.map((m) => ({
			kind: "entity-move",
			id: m.id,
			before: m.before,
			after: m.after,
		}));
	recordComposite(document, entries);
};

/**
 * Nudge a set of entities by `(dx, dy)` world units, journaled as one composite
 * (plan E6). Reads each entity's current authored position from the document's
 * projection; entities without a transform are skipped.
 */
export const nudgeEntities = (
	document: SceneDocument,
	ids: Iterable<EntityId>,
	dx: number,
	dy: number,
): void => {
	const moves: EntityMove[] = [];
	for (const id of ids) {
		const transform = document.projection.getComponent(
			id,
			TransformComponent,
		);
		if (!transform) {
			continue;
		}
		const before = {
			x: transform.position.x,
			y: transform.position.y,
		};
		moves.push({
			id,
			before,
			after: { x: before.x + dx, y: before.y + dy },
		});
	}
	moveEntities(document, moves);
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

/**
 * A field binding that fans an edit out to a component shared by several
 * entities, journaling every change as **one** composite — a single undo step
 * (plan F5). The read source is the first id (the representative shown in the
 * inspector); a commit rewrites the same path on every id whose current value
 * differs (the `before === after` guard is evaluated per entity, so entities
 * already at the target value contribute no entry). A gesture-preview `record`
 * fans out the same way, taking the representative's `before` from the caller
 * (its live value is already the new one) and each other id's `before` from its
 * own current value.
 *
 * Routing to authored vs runtime entities is the document's job: the composite
 * flows through {@link SceneDocument.record}, which splits a mixed set into a
 * journaled group and a live-only poked group (plan F6).
 */
export const multiEntityFieldBinding = (
	document: SceneDocument,
	ids: ReadonlyArray<EntityId>,
	componentType: string,
): FieldBinding => {
	const cls = componentClass(componentType);
	const containerOf = (id: EntityId): Container | null =>
		cls
			? ((document.projection.getComponent(id, cls) as
					| Container
					| undefined) ?? null)
			: null;
	const build = (base: ReadonlyArray<string>): FieldBinding => {
		const resolveAt = (id: EntityId, path: ReadonlyArray<string>) =>
			walkTo(containerOf(id), [...base, ...path]);
		const fanOut = (
			path: ReadonlyArray<string>,
			after: FieldValue,
			representativeBefore: FieldValue | undefined,
		): void => {
			const entries: JournalEntry[] = [];
			ids.forEach((id, index) => {
				const target = resolveAt(id, path);
				if (!target) {
					return;
				}
				const before =
					index === 0 && representativeBefore !== undefined
						? representativeBefore
						: (target.container[target.key] as FieldValue);
				if (before === after) {
					return;
				}
				entries.push({
					kind: "field-set",
					id,
					type: componentType,
					path: [...base, ...path],
					before,
					after,
				});
			});
			recordComposite(document, entries);
		};
		return {
			resolve: (path) => resolveAt(ids[0]!, path),
			commit: (path, after) => fanOut(path, after, undefined),
			record: (path, before, after) => fanOut(path, after, before),
			sub: (prefix) => build([...base, ...prefix]),
		};
	};
	return build([]);
};

/** A field binding onto the scene config (gravity, ui scale). */
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
