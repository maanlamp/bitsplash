import { PhysicsBodyComponent } from "../engine/components/physics-body";
import { SpriteComponent } from "../engine/components/sprite";
import { TransformComponent } from "../engine/components/transform";
import type { EntityId, ReadonlyECS } from "../engine/ecs";
import { TILE_SIZE } from "../engine/tile";
import Vector2 from "../engine/vector2";

export type EntityBounds = Readonly<{
	center: Vector2;
	half: Vector2;
}>;

export const entityBounds = (
	ecs: ReadonlyECS,
	id: EntityId,
): EntityBounds | null => {
	const transform = ecs.getComponent(id, TransformComponent);
	if (!transform) {
		return null;
	}
	const body = ecs.getComponent(id, PhysicsBodyComponent);
	const sprite = ecs.getComponent(id, SpriteComponent);
	let halfWidth = TILE_SIZE / 2;
	let halfHeight = TILE_SIZE / 2;
	if (body) {
		halfWidth = body.halfWidth;
		halfHeight = body.halfHeight;
	} else if (sprite) {
		halfWidth = sprite.width / 2;
		halfHeight = sprite.height / 2;
	}
	return {
		center: transform.position.clone(),
		half: new Vector2(halfWidth, halfHeight),
	};
};

export const pickEntityAt = (
	ecs: ReadonlyECS,
	world: Vector2,
): EntityId | null => {
	let best: EntityId | null = null;
	let bestArea = Number.POSITIVE_INFINITY;
	for (const id of ecs.entities()) {
		const bounds = entityBounds(ecs, id);
		if (!bounds) {
			continue;
		}
		if (
			Math.abs(world.x - bounds.center.x) <= bounds.half.x &&
			Math.abs(world.y - bounds.center.y) <= bounds.half.y
		) {
			const area = bounds.half.x * bounds.half.y;
			if (area < bestArea) {
				bestArea = area;
				best = id;
			}
		}
	}
	return best;
};
