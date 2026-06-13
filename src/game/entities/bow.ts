import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import type { EntityId } from "../../engine/ecs";
import type { World } from "../../engine/world";
import bowUrl from "../assets/bow.png";
import { BowComponent } from "../components/bow";

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
		new TransformComponent(start?.x, start?.y),
		new SpriteComponent({ key: bowUrl, width: 16, height: 16 }),
		new BowComponent(options.owner),
	]);
};
