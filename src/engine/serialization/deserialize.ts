import type { EntityId } from "../ecs";
import type { World } from "../world";
import {
	serializableType,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { reconstruct } from "./value";

/**
 * How {@link deserializeEntity}/{@link deserializeWorld} treat a component
 * name with no registered {@link serializableType}.
 *
 * - `"skip"` (default): silently drop the component. Used by runtime paths
 *   that must tolerate stale data — save-game restore, freeze/thaw snapshots,
 *   prefab spawns — where an old blob must never crash the game.
 * - `"throw"`: hard-fail, naming the source, entity, and component. Used by the
 *   editor's document-open path: an authored scene file referencing an unknown
 *   component is a programmer error, not a recoverable state.
 */
export type UnknownComponentPolicy = "skip" | "throw";

export const deserializeEntity = (
	world: World,
	entity: SerializedEntity,
	source = "entity",
	onUnknown: UnknownComponentPolicy = "skip",
): EntityId => {
	const components: object[] = [];
	for (const [name, data] of Object.entries(entity.components)) {
		const type = serializableType(name);
		if (!type) {
			if (onUnknown === "throw") {
				throw new Error(
					`${source}: entity "${entity.id}" references unknown component type "${name}"`,
				);
			}
			continue;
		}
		components.push(
			reconstruct(type, data, `${source} ${entity.id} · ${name}`),
		);
	}
	return world.ecs.createEntity(components, entity.id as EntityId);
};

export const deserializeWorld = (
	world: World,
	entities: SerializedWorld,
	source = "entity",
	onUnknown: UnknownComponentPolicy = "skip",
): void => {
	for (const entity of entities) {
		deserializeEntity(world, entity, source, onUnknown);
	}
};
