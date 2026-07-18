import type { EntityId } from "../engine/ecs";
import type { SerializedComponent } from "../engine/serialization/registry";
import { SpriteComponent } from "../engine/sprite/sprite-component";
import { TransformComponent } from "../engine/transform-component";
import Vector2 from "../engine/vector2";
import { AssetDropRegistry } from "./asset-drop-registry";
import { assetFilename } from "./assets";
import { createEntity } from "./commands";
import { readTextFile, resolveToWebPath } from "./project-io";
import { toastError } from "./toast";

AssetDropRegistry.register(
	["sprite", "tileset"],
	["inspector-field"],
	(payload, context) => {
		void resolveToWebPath(payload.path).then((webPath) => {
			context.field?.apply(webPath);
		});
	},
);

/**
 * Sprite dropped onto the scene view: create a minimal, asset-appropriate
 * entity at the snapped drop point — a {@link TransformComponent} plus a
 * {@link SpriteComponent} pointed at the dropped image, and nothing else. A
 * dropped sprite is not the scene's `defaultEntity` (which stamps extras such
 * as a debug label); it carries only the components a sprite needs (plan F2).
 * The create is journaled through {@link createEntity}, so it lands on the
 * authored document, never a live world.
 */
AssetDropRegistry.register(
	["sprite"],
	["scene-view"],
	(payload, context) => {
		const info = context.sceneView;
		if (!info) {
			return;
		}
		void resolveToWebPath(payload.path).then((webPath) => {
			const id = createEntity(info.document, [
				new TransformComponent(
					new Vector2(info.worldPoint.x, info.worldPoint.y),
				),
				new SpriteComponent(webPath),
			]);
			info.store.selectOne(id);
		});
	},
);

type PrefabFile = Readonly<{
	components: Record<string, SerializedComponent>;
}>;

const readPrefab = async (
	path: string,
): Promise<PrefabFile | null> => {
	try {
		const parsed = JSON.parse(await readTextFile(path)) as PrefabFile;
		return parsed && typeof parsed.components === "object"
			? parsed
			: null;
	} catch {
		return null;
	}
};

/**
 * Prefab dropped onto the scene view: read the `.prefab.json` as authored data
 * (never the Game-layer prefab registry) and journal a raw `entity-create` with
 * its already-serialized components, patching the Transform position to the
 * snapped drop point (plan F3). Goes through {@link SceneDocument.record}, so the
 * create is journaled onto the authored document, never spawned into a live world.
 */
AssetDropRegistry.register(
	["prefab"],
	["scene-view"],
	(payload, context) => {
		const info = context.sceneView;
		if (!info) {
			return;
		}
		void readPrefab(payload.path).then((prefab) => {
			if (!prefab) {
				toastError(
					`Couldn't read prefab "${assetFilename(payload.path)}".`,
				);
				return;
			}
			const components = structuredClone(prefab.components);
			const transform = components.Transform as
				| { position?: { x: number; y: number } }
				| undefined;
			if (!transform?.position) {
				toastError(
					`Prefab "${assetFilename(payload.path)}" has no Transform, so it can't be positioned.`,
				);
				return;
			}
			transform.position.x = info.worldPoint.x;
			transform.position.y = info.worldPoint.y;
			const id = crypto.randomUUID() as EntityId;
			info.document.record({
				kind: "entity-create",
				entity: { id, components },
			});
			info.store.select([id]);
		});
	},
);
