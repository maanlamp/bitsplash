import type { EntityId, ReadonlyECS } from "../ecs";
import {
	serializableTypeOf,
	type SerializedComponent,
	type SerializedEntity,
	type SerializedWorld,
} from "./registry";
import { walkFields } from "./value";

// "runtime" captures the full live world (save-games, scene freeze/thaw,
// editor playtest snapshots) — everything, including transient runtime state
// like camera pose and sequence run-state. "authored" produces the design-time
// scene document the editor saves; components declared `runtime` in
// @serializable (cameras, fades, sequences) are spawned by systems at play
// time, never authored, and are omitted so they can never leak into a level
// file. This is the single provenance rule; every save path routes through it.
export type SerializeScope = "runtime" | "authored";

export const serializeEntity = (
	ecs: ReadonlyECS,
	id: EntityId,
	scope: SerializeScope = "runtime",
): SerializedEntity | null => {
	const components: Record<string, SerializedComponent> = {};
	let any = false;
	for (const component of ecs.componentsOf(id)) {
		const type = serializableTypeOf(component);
		if (!type) {
			continue;
		}
		if (scope === "authored" && type.runtime) {
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
	scope: SerializeScope = "runtime",
): SerializedWorld =>
	ecs
		.entities()
		.filter((id) => !predicate || predicate(id))
		.map((id) => serializeEntity(ecs, id, scope))
		.filter((entity): entity is SerializedEntity => entity !== null);
