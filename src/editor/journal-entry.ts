import type { EntityId } from "../engine/ecs";
import { PhysicsBodyComponent } from "../engine/physics/physics-body-component";
import type { SceneConfig } from "../engine/scene/scene";
import { deserializeEntity } from "../engine/serialization/deserialize";
import {
	componentClass,
	serializableType,
	type SerializedComponent,
	type SerializedEntity,
} from "../engine/serialization/registry";
import { reconstruct } from "../engine/serialization/value";
import { TileLayerComponent } from "../engine/tilemap/tile-layer-component";
import { TransformComponent } from "../engine/transform-component";
import type { World } from "../engine/world";

/** A primitive value a field/config edit can carry. */
export type FieldValue = number | string | boolean | null;

/** A single grid cell an authored tile edit touches. */
export type TileCell = Readonly<{ gx: number; gy: number }>;

type Point = Readonly<{ x: number; y: number }>;

type Container = Record<string, unknown>;

/**
 * An append-only edit delta. Every editor mutation of a scene document is one
 * of these. An entry is self-contained — it carries everything needed to both
 * {@link applyEntry apply} it to a world/config and {@link invertEntry invert}
 * it — so the journal replays deterministically onto a scratch world at save
 * and inverses never read a live (possibly simulating) world.
 */
export type JournalEntry =
	| Readonly<{ kind: "entity-create"; entity: SerializedEntity }>
	| Readonly<{ kind: "entity-delete"; entity: SerializedEntity }>
	| Readonly<{
			kind: "component-add";
			id: EntityId;
			type: string;
			data: SerializedComponent;
	  }>
	| Readonly<{
			kind: "component-remove";
			id: EntityId;
			type: string;
			data: SerializedComponent;
	  }>
	| Readonly<{
			kind: "entity-move";
			id: EntityId;
			before: Point;
			after: Point;
	  }>
	| Readonly<{
			kind: "field-set";
			id: EntityId;
			type: string;
			path: ReadonlyArray<string>;
			before: FieldValue;
			after: FieldValue;
	  }>
	| Readonly<{
			kind: "tile-op";
			layerId: EntityId;
			added: ReadonlyArray<TileCell>;
			removed: ReadonlyArray<TileCell>;
	  }>
	| Readonly<{
			kind: "config-set";
			path: ReadonlyArray<string>;
			before: FieldValue;
			after: FieldValue;
	  }>
	| Readonly<{
			kind: "composite";
			entries: ReadonlyArray<JournalEntry>;
	  }>;

/**
 * Where an entry lives-applies. `world` receives the entity/component/tile
 * mutations; `config` receives scene-config mutations (gravity is mirrored onto
 * the world's physics). In this step the document's edit world and config are
 * both the live projection; a later step can point `world` at a run world while
 * inverses continue to read the document's projection.
 */
export type ReplayTarget = Readonly<{
	world: World;
	config: SceneConfig;
}>;

/**
 * Walk `path` from `root`, returning the leaf's container and key, or `null`
 * when any intermediate segment is missing or not an object.
 */
export const walkTo = (
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

const setField = (
	root: Container | null,
	path: ReadonlyArray<string>,
	value: FieldValue,
): void => {
	const target = walkTo(root, path);
	if (target) {
		target.container[target.key] = value;
	}
};

/** Apply an entry to a live-apply target. Throws if the entry is malformed. */
export const applyEntry = (
	entry: JournalEntry,
	target: ReplayTarget,
): void => {
	const ecs = target.world.ecs;
	switch (entry.kind) {
		case "entity-create":
			deserializeEntity(
				target.world,
				entry.entity,
				"journal",
				"throw",
			);
			return;
		case "entity-delete":
			ecs.destroy(entry.entity.id as EntityId);
			ecs.flushDestroyed();
			return;
		case "component-add": {
			const type = serializableType(entry.type);
			if (!type) {
				throw new Error(
					`journal: unknown component type "${entry.type}"`,
				);
			}
			ecs.addComponent(entry.id, reconstruct(type, entry.data));
			return;
		}
		case "component-remove": {
			const cls = componentClass(entry.type);
			if (!cls) {
				throw new Error(
					`journal: unknown component type "${entry.type}"`,
				);
			}
			ecs.removeComponent(entry.id, cls);
			return;
		}
		case "entity-move": {
			const transform = ecs.getComponent(
				entry.id,
				TransformComponent,
			);
			if (transform) {
				transform.position.x = entry.after.x;
				transform.position.y = entry.after.y;
			}
			const body = ecs.getComponent(
				entry.id,
				PhysicsBodyComponent,
			)?.body;
			if (body) {
				body.setTransform(
					entry.after,
					transform?.rotation.radians ?? 0,
				);
				body.linearVelocity = { x: 0, y: 0 };
				body.setAngularVelocity(0);
			}
			return;
		}
		case "field-set": {
			const type = serializableType(entry.type);
			const cls = componentClass(entry.type);
			if (!type || !cls) {
				throw new Error(
					`journal: unknown component type "${entry.type}"`,
				);
			}
			const component = ecs.getComponent(entry.id, cls) as
				| Container
				| undefined;
			setField(component ?? null, entry.path, entry.after);
			return;
		}
		case "tile-op": {
			const grid = ecs.getComponent(
				entry.layerId,
				TileLayerComponent,
			)?.grid;
			if (!grid) {
				return;
			}
			for (const c of entry.added) {
				grid.setTile(c.gx, c.gy);
			}
			for (const c of entry.removed) {
				grid.removeTile(c.gx, c.gy);
			}
			return;
		}
		case "config-set":
			setField(
				target.config as unknown as Container,
				entry.path,
				entry.after,
			);
			if (entry.path[0] === "gravity") {
				target.world.setGravity(target.config.gravity);
			}
			return;
		case "composite":
			for (const sub of entry.entries) {
				applyEntry(sub, target);
			}
			return;
	}
};

/**
 * The entity ids an entry mutates, used by the command router to classify an
 * edit as authoring a document entity versus poking a runtime-spawned one.
 * Entries with no entity target (scene-config edits) contribute nothing; an
 * `entity-create` targets the new id (always a document member by construction).
 */
export const entryTargets = (
	entry: JournalEntry,
): ReadonlyArray<EntityId> => {
	switch (entry.kind) {
		case "entity-create":
		case "entity-delete":
			return [entry.entity.id as EntityId];
		case "component-add":
		case "component-remove":
		case "entity-move":
		case "field-set":
			return [entry.id];
		case "tile-op":
			return [entry.layerId];
		case "config-set":
			return [];
		case "composite":
			return entry.entries.flatMap(entryTargets);
	}
};

/**
 * Produce the inverse of a forward entry. Pure: it reads only the entry's own
 * data (captured from the document's projection when the command ran), never a
 * live world, so undoing a mid-run delete can never bake simulation state into
 * the document.
 */
export const invertEntry = (entry: JournalEntry): JournalEntry => {
	switch (entry.kind) {
		case "entity-create":
			return { kind: "entity-delete", entity: entry.entity };
		case "entity-delete":
			return { kind: "entity-create", entity: entry.entity };
		case "component-add":
			return {
				kind: "component-remove",
				id: entry.id,
				type: entry.type,
				data: entry.data,
			};
		case "component-remove":
			return {
				kind: "component-add",
				id: entry.id,
				type: entry.type,
				data: entry.data,
			};
		case "entity-move":
			return {
				kind: "entity-move",
				id: entry.id,
				before: entry.after,
				after: entry.before,
			};
		case "field-set":
			return {
				kind: "field-set",
				id: entry.id,
				type: entry.type,
				path: entry.path,
				before: entry.after,
				after: entry.before,
			};
		case "tile-op":
			return {
				kind: "tile-op",
				layerId: entry.layerId,
				added: entry.removed,
				removed: entry.added,
			};
		case "config-set":
			return {
				kind: "config-set",
				path: entry.path,
				before: entry.after,
				after: entry.before,
			};
		case "composite":
			return {
				kind: "composite",
				entries: [...entry.entries].reverse().map(invertEntry),
			};
	}
};
