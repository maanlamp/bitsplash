import type { EntityId } from "../../engine/ecs";
import type { World } from "../../engine/world";
import { BowComponent } from "../combat/bow-component";
import { DamageStatsComponent } from "../combat/damage-stats-component";

export const attachBow = (world: World, owner: EntityId): void => {
	if (world.ecs.getComponent(owner, BowComponent)) {
		return;
	}
	world.ecs.addComponent(owner, new BowComponent());
	world.ecs.addComponent(
		owner,
		new DamageStatsComponent(25, 0.1, 2, "arrow"),
	);
};
