import type AssetManager from "../engine/assets";
import { PhysicsBodyComponent } from "../engine/physics/physics-body-component";
import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../engine/sprite/sprite-component";
import { TransformComponent } from "../engine/transform-component";
import type { EntityId, ReadonlyECS } from "../engine/ecs";
import { TILE_SIZE } from "../engine/tilemap/tile";
import Vector2 from "../engine/vector2";
import { getPickIndex } from "./pick-index";

export type GeometryRole =
	| "collider"
	| "sensor"
	| "sprite"
	| "fallback";

export type GeometryPiece = Readonly<{
	role: GeometryRole;
	center: Vector2;
	half: Vector2;
}>;

export type EntityBounds = Readonly<{
	center: Vector2;
	half: Vector2;
}>;

/**
 * The one canonical world-space AABB per entity, the single bounds definition
 * shared by picking, snapping, highlight, and marquee (plan shared contract).
 * `null` for an entity with no resolvable geometry (no transform).
 */
export type EntityAabb = Readonly<{
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}>;

export const entityGeometry = (
	ecs: ReadonlyECS,
	id: EntityId,
	assetManager?: AssetManager,
): GeometryPiece[] => {
	const transform = ecs.getComponent(id, TransformComponent);
	if (!transform) {
		return [];
	}
	const pieces: GeometryPiece[] = [];
	const body = ecs.getComponent(id, PhysicsBodyComponent);
	if (body) {
		pieces.push({
			role: body.sensor ? "sensor" : "collider",
			center: new Vector2(
				transform.position.x + body.offsetX,
				transform.position.y + body.offsetY,
			),
			half: new Vector2(body.halfWidth, body.halfHeight),
		});
	}
	const sprite = ecs.getComponent(id, SpriteComponent);
	if (sprite) {
		const image = assetManager?.getImage(spriteImageUrl(sprite));
		if (image) {
			const source = spriteSource(sprite, image);
			pieces.push({
				role: "sprite",
				center: transform.position.clone(),
				half: new Vector2(
					(source.width * transform.scale.x) / 2,
					(source.height * transform.scale.y) / 2,
				),
			});
		}
	}
	if (pieces.length === 0) {
		pieces.push({
			role: "fallback",
			center: transform.position.clone(),
			half: new Vector2(TILE_SIZE / 2, TILE_SIZE / 2),
		});
	}
	return pieces;
};

export const unionBounds = (
	pieces: ReadonlyArray<GeometryPiece>,
): EntityBounds | null => {
	if (pieces.length === 0) {
		return null;
	}
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const piece of pieces) {
		minX = Math.min(minX, piece.center.x - piece.half.x);
		minY = Math.min(minY, piece.center.y - piece.half.y);
		maxX = Math.max(maxX, piece.center.x + piece.half.x);
		maxY = Math.max(maxY, piece.center.y + piece.half.y);
	}
	return {
		center: new Vector2((minX + maxX) / 2, (minY + maxY) / 2),
		half: new Vector2((maxX - minX) / 2, (maxY - minY) / 2),
	};
};

/**
 * The canonical world-space {@link EntityAabb} for an entity, the union of its
 * geometry pieces. `null` when the entity has no resolvable geometry.
 */
export const entityAabb = (
	ecs: ReadonlyECS,
	id: EntityId,
	assetManager?: AssetManager,
): EntityAabb | null => {
	const bounds = unionBounds(entityGeometry(ecs, id, assetManager));
	if (!bounds) {
		return null;
	}
	return {
		minX: bounds.center.x - bounds.half.x,
		minY: bounds.center.y - bounds.half.y,
		maxX: bounds.center.x + bounds.half.x,
		maxY: bounds.center.y + bounds.half.y,
	};
};

/**
 * Whether `id` has a sprite whose image has not finished loading, so its cached
 * {@link EntityAabb} is still provisional (a fallback/body box rather than the
 * sprite's true rendered bounds). The pick index uses this to know an entity
 * must be reindexed once its image resolves — an image load marks no entity
 * dirty, so without this the AABB would stay a tiny center box forever.
 */
export const spriteImagePending = (
	ecs: ReadonlyECS,
	id: EntityId,
	assetManager?: AssetManager,
): boolean => {
	const sprite = ecs.getComponent(id, SpriteComponent);
	if (!sprite || !assetManager) {
		return false;
	}
	return !assetManager.getImage(spriteImageUrl(sprite));
};

const contains = (piece: GeometryPiece, world: Vector2): boolean =>
	Math.abs(world.x - piece.center.x) <= piece.half.x &&
	Math.abs(world.y - piece.center.y) <= piece.half.y;

/**
 * The topmost entity under `world`: a broad-phase `rbush` query for candidates
 * whose AABB contains the point, then the same smallest-area-piece narrow test
 * the pre-index picker used, run only over those candidates (plan C3). The
 * broad phase never misses a hit — an entity's cached AABB is the union of its
 * geometry pieces, so any piece containing the point implies the AABB does.
 */
export const pickEntityAt = (
	ecs: ReadonlyECS,
	world: Vector2,
	assetManager?: AssetManager,
): EntityId | null => {
	let best: EntityId | null = null;
	let bestArea = Number.POSITIVE_INFINITY;
	const candidates = getPickIndex(ecs).search({
		minX: world.x,
		minY: world.y,
		maxX: world.x,
		maxY: world.y,
	});
	for (const id of candidates) {
		for (const piece of entityGeometry(ecs, id, assetManager)) {
			if (!contains(piece, world)) {
				continue;
			}
			const area = piece.half.x * piece.half.y;
			if (area < bestArea) {
				bestArea = area;
				best = id;
			}
		}
	}
	return best;
};
