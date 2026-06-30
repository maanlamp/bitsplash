import type AssetManager from "../engine/assets";
import { PhysicsBodyComponent } from "../engine/components/physics-body";
import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../engine/components/sprite";
import { TransformComponent } from "../engine/components/transform";
import type { EntityId, ReadonlyECS } from "../engine/ecs";
import { TILE_SIZE } from "../engine/tile";
import Vector2 from "../engine/vector2";

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

const contains = (piece: GeometryPiece, world: Vector2): boolean =>
	Math.abs(world.x - piece.center.x) <= piece.half.x &&
	Math.abs(world.y - piece.center.y) <= piece.half.y;

export const pickEntityAt = (
	ecs: ReadonlyECS,
	world: Vector2,
	assetManager?: AssetManager,
): EntityId | null => {
	let best: EntityId | null = null;
	let bestArea = Number.POSITIVE_INFINITY;
	for (const id of ecs.entities()) {
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
