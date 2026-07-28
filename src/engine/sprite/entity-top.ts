import type AssetManager from "../assets";
import type { EntityId, ReadonlyECS } from "../ecs";
import { TransformComponent } from "../transform-component";
import { resolveSpriteDraw } from "./resolve-sprite-draw";
import { SpriteComponent } from "./sprite-component";

/**
 * World-space y of the top of an entity's drawn sprite art, raised by `gap` —
 * the one anchor every overhead affordance (barks, health bars, quest markers,
 * hitsplats, interact hints, debug tags) hangs off.
 *
 * {@link import("./sprite-render-system").SpriteRenderSystem} centres the
 * resolved content rect on `transform.position`, so the art's top is exactly
 * `y - (source.height * scale.y) / 2`. Resolution goes through
 * {@link resolveSpriteDraw}, so `.bsprite` archives measure correctly — a raw
 * `assetManager.getImage` cannot load a zip and silently measures nothing.
 *
 * The rect is the **current tag's** content rect, so the anchor rises and falls
 * a few pixels as the sprite changes pose. A caller that must not bob should
 * pass a `gap` sized for the tallest pose rather than re-deriving the anchor.
 *
 * Returns `null` when the entity has no transform, no sprite, or its sprite
 * asset is still loading, leaving the fallback anchor to the caller (a physics
 * extent, or the transform position itself). Cheap enough to call every frame.
 *
 * @example
 * const top = entityTop(ecs, assetManager, id, 6);
 * dyn.set(node.id, { worldY: top ?? transform.position.y - 6 });
 */
export const entityTop = (
	ecs: ReadonlyECS,
	assetManager: AssetManager,
	id: EntityId,
	gap: number,
): number | null => {
	const transform = ecs.getComponent(id, TransformComponent);
	const sprite = ecs.getComponent(id, SpriteComponent);
	if (!transform || !sprite) {
		return null;
	}
	const draw = resolveSpriteDraw(sprite, assetManager);
	if (!draw) {
		return null;
	}
	return (
		transform.position.y -
		(draw.source.height * transform.scale.y) / 2 -
		gap
	);
};
