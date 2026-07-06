import type { EntityId, ReadonlyECS } from "../engine/ecs";
import { deserializeEntity } from "../engine/serialization/deserialize";
import {
	componentClass,
	type ComponentClass,
	serializableType,
	serializableTypeName,
} from "../engine/serialization/registry";
import { serializeEntity } from "../engine/serialization/serialize";
import {
	reconstruct,
	walkFields,
} from "../engine/serialization/value";
import { PhysicsBodyComponent } from "../engine/physics/physics-body-component";
import { TILE_SIZE } from "../engine/tilemap/tile";
import { TransformComponent } from "../engine/transform-component";
import type { World } from "../engine/world";
import type { History } from "./history";

const classOf = (component: object): ComponentClass =>
	component.constructor as ComponentClass;

const worldOf = (history: History, fallback: World): World =>
	history.world ?? fallback;

const ecsOf = (
	history: History,
	fallback: ReadonlyECS,
): ReadonlyECS => history.world?.ecs ?? fallback;

export const createEntity = (
	world: World,
	history: History,
	components: ReadonlyArray<object>,
): EntityId => {
	const id = worldOf(history, world).ecs.createEntity(components);
	history.createdIds.add(id);
	const data = serializeEntity(worldOf(history, world).ecs, id);
	history.push({
		undo: () => worldOf(history, world).ecs.destroyEntity(id),
		redo: () => {
			const target = worldOf(history, world);
			if (data) {
				deserializeEntity(target, data);
			} else {
				target.ecs.createEntity(components, id);
			}
		},
	});
	return id;
};

export const deleteEntity = (
	world: World,
	history: History,
	id: EntityId,
): void => {
	const components = [
		...worldOf(history, world).ecs.componentsOf(id),
	];
	worldOf(history, world).ecs.destroyEntity(id);
	history.push({
		undo: () => {
			worldOf(history, world).ecs.createEntity(components, id);
		},
		redo: () => worldOf(history, world).ecs.destroyEntity(id),
	});
};

export const duplicateEntity = (
	world: World,
	history: History,
	id: EntityId,
): EntityId | null => {
	const data = serializeEntity(worldOf(history, world).ecs, id);
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
	const newId = crypto.randomUUID();
	const entity = { id: newId, components };
	history.createdIds.add(newId);
	deserializeEntity(worldOf(history, world), entity);
	history.push({
		undo: () => worldOf(history, world).ecs.destroyEntity(newId),
		redo: () => {
			deserializeEntity(worldOf(history, world), entity);
		},
	});
	return newId;
};

export const addComponent = (
	world: World,
	history: History,
	id: EntityId,
	component: object,
): void => {
	const cls = classOf(component);
	worldOf(history, world).ecs.addComponent(id, component);
	const name = serializableTypeName(component);
	const data = name
		? walkFields(serializableType(name)!, component)
		: null;
	history.push({
		undo: () => worldOf(history, world).ecs.removeComponent(id, cls),
		redo: () => {
			const target = worldOf(history, world);
			if (name && data) {
				target.ecs.addComponent(
					id,
					reconstruct(serializableType(name)!, data),
				);
			} else {
				target.ecs.addComponent(id, component);
			}
		},
	});
};

export const removeComponent = (
	world: World,
	history: History,
	id: EntityId,
	component: object,
): void => {
	const cls = classOf(component);
	worldOf(history, world).ecs.removeComponent(id, cls);
	history.push({
		undo: () =>
			worldOf(history, world).ecs.addComponent(id, component),
		redo: () => worldOf(history, world).ecs.removeComponent(id, cls),
	});
};

export const moveEntity = (
	ecs: ReadonlyECS,
	history: History,
	id: EntityId,
	before: Readonly<{ x: number; y: number }>,
	after: Readonly<{ x: number; y: number }>,
): void => {
	if (before.x === after.x && before.y === after.y) {
		return;
	}
	const apply = (to: Readonly<{ x: number; y: number }>): void => {
		const target = ecsOf(history, ecs);
		const transform = target.getComponent(id, TransformComponent);
		if (transform) {
			transform.position.x = to.x;
			transform.position.y = to.y;
		}
		const body = target.getComponent(id, PhysicsBodyComponent)?.body;
		if (body) {
			body.setTransform(to, transform?.rotation.radians ?? 0);
			body.linearVelocity = { x: 0, y: 0 };
			body.setAngularVelocity(0);
		}
	};
	apply(after);
	history.push({
		undo: () => apply(before),
		redo: () => apply(after),
	});
};

export type FieldValue = number | string | boolean | null;

type Container = Record<string, unknown>;

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

const walkTo = (
	root: Container | null,
	path: ReadonlyArray<string>,
): { container: Container; key: string } | null => {
	if (!root || path.length === 0) {
		return null;
	}
	let container: Container = root;
	for (let i = 0; i < path.length - 1; i++) {
		const next = container[path[i]!];
		if (next === null || typeof next !== "object") {
			return null;
		}
		container = next as Container;
	}
	return { container, key: path[path.length - 1]! };
};

const makeBinding = (
	history: History,
	root: () => Container | null,
	base: ReadonlyArray<string>,
): FieldBinding => {
	const resolve = (path: ReadonlyArray<string>) =>
		walkTo(root(), [...base, ...path]);
	const record = (
		path: ReadonlyArray<string>,
		before: FieldValue,
		after: FieldValue,
	): void => {
		if (before === after) {
			return;
		}
		history.push({
			undo: () => {
				const t = resolve(path);
				if (t) {
					t.container[t.key] = before;
				}
			},
			redo: () => {
				const t = resolve(path);
				if (t) {
					t.container[t.key] = after;
				}
			},
		});
	};
	return {
		resolve,
		record,
		commit: (path, after) => {
			const t = resolve(path);
			if (!t) {
				return;
			}
			const before = t.container[t.key] as FieldValue;
			if (before === after) {
				return;
			}
			t.container[t.key] = after;
			record(path, before, after);
		},
		sub: (prefix) => makeBinding(history, root, [...base, ...prefix]),
	};
};

export const entityFieldBinding = (
	ecs: ReadonlyECS,
	history: History,
	entity: EntityId,
	componentType: string,
): FieldBinding => {
	const cls = componentClass(componentType);
	return makeBinding(
		history,
		() =>
			cls
				? ((ecsOf(history, ecs).getComponent(entity, cls) as
						| Container
						| undefined) ?? null)
				: null,
		[],
	);
};

export const objectFieldBinding = (
	history: History,
	root: object,
): FieldBinding => makeBinding(history, () => root as Container, []);
