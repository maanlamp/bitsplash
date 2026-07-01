import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import type { EntityId } from "../../engine/ecs";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import bowUrl from "../content/assets/bow.png";
import { BowComponent } from "../combat/bow-component";

export const spawnBow = (
	world: World,
	options: Readonly<{ owner: EntityId }>,
): EntityId => {
	const transform = world.ecs.getComponent(
		options.owner,
		TransformComponent,
	);
	const start = transform ? transform.position.clone() : undefined;
	return world.ecs.createEntity([
		new TransformComponent(new Vector2(start?.x, start?.y)),
		new SpriteComponent(bowUrl),
		new BowComponent(options.owner),
	]);
};
