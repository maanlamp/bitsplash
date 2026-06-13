import type { EntityId } from "../engine/ecs";
import { deserializeEntity } from "../engine/serialization/deserialize";
import type { ComponentClass } from "../engine/serialization/registry";
import { serializeEntity } from "../engine/serialization/serialize";
import { TILE_SIZE } from "../engine/tile";
import type { World } from "../engine/world";
import type { History } from "./history";

const classOf = (component: object): ComponentClass =>
	component.constructor as ComponentClass;

export const createEntity = (
	world: World,
	history: History,
	components: ReadonlyArray<object>,
): EntityId => {
	const id = world.ecs.createEntity(components);
	history.push({
		undo: () => world.ecs.destroyEntity(id),
		redo: () => world.ecs.createEntity(components, id),
	});
	return id;
};

export const deleteEntity = (
	world: World,
	history: History,
	id: EntityId,
): void => {
	const components = [...world.ecs.componentsOf(id)];
	world.ecs.destroyEntity(id);
	history.push({
		undo: () => world.ecs.createEntity(components, id),
		redo: () => world.ecs.destroyEntity(id),
	});
};

export const duplicateEntity = (
	world: World,
	history: History,
	id: EntityId,
): EntityId | null => {
	const data = serializeEntity(world.ecs, id);
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
	deserializeEntity(world, entity);
	history.push({
		undo: () => world.ecs.destroyEntity(newId),
		redo: () => deserializeEntity(world, entity),
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
	world.ecs.addComponent(id, component);
	history.push({
		undo: () => world.ecs.removeComponent(id, cls),
		redo: () => world.ecs.addComponent(id, component),
	});
};

export const removeComponent = (
	world: World,
	history: History,
	id: EntityId,
	component: object,
): void => {
	const cls = classOf(component);
	world.ecs.removeComponent(id, cls);
	history.push({
		undo: () => world.ecs.addComponent(id, component),
		redo: () => world.ecs.removeComponent(id, cls),
	});
};

export const setField = <T>(
	history: History,
	target: Record<string, T>,
	key: string,
	before: T,
	after: T,
): void => {
	target[key] = after;
	history.push({
		undo: () => {
			target[key] = before;
		},
		redo: () => {
			target[key] = after;
		},
	});
};
