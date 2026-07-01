import { TransformComponent } from "../engine/transform-component";
import type { EntityId } from "../engine/ecs";
import { deserializeEntity } from "../engine/serialization/deserialize";
import type { SerializedComponent } from "../engine/serialization/registry";
import type Vector2 from "../engine/vector2";
import type { World } from "../engine/world";

type PrefabDefinition = Readonly<{
	components: Record<string, SerializedComponent>;
}>;

const modules = import.meta.glob("./content/prefabs/*.json", {
	eager: true,
}) as Record<string, { default: PrefabDefinition }>;

const prefabs = new Map<string, PrefabDefinition>();
for (const [path, mod] of Object.entries(modules)) {
	const name = path
		.split("/")
		.pop()!
		.replace(/\.json$/, "");
	prefabs.set(name, mod.default);
}

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
	const entity = deserializeEntity(world, {
		id: id ?? crypto.randomUUID(),
		components: definition.components,
	});
	const transform = world.ecs.getComponent(
		entity,
		TransformComponent,
	);
	transform?.position.set(position.x, position.y);
	return entity;
};
