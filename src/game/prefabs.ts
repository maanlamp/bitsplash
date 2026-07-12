import { TransformComponent } from "../engine/transform-component";
import type { EntityId } from "../engine/ecs";
import { deserializeEntity } from "../engine/serialization/deserialize";
import type { SerializedComponent } from "../engine/serialization/registry";
import type Vector2 from "../engine/vector2";
import type { World } from "../engine/world";

export type PrefabDefinition = Readonly<{
	components: Record<string, SerializedComponent>;
}>;

const prefabs = new Map<string, PrefabDefinition>();

export const registerPrefab = (
	name: string,
	definition: PrefabDefinition,
): void => {
	prefabs.set(name, definition);
};

export const spawnPrefab = (
	world: World,
	name: string,
	position: Vector2,
	id?: EntityId,
): EntityId | null => {
	const definition = prefabs.get(name);
	if (!definition) {
		return null;
	}
	const entity = deserializeEntity(
		world,
		{
			id: id ?? crypto.randomUUID(),
			components: definition.components,
		},
		`prefab "${name}"`,
	);
	const transform = world.ecs.getComponent(
		entity,
		TransformComponent,
	);
	transform?.position.set(position.x, position.y);
	return entity;
};
