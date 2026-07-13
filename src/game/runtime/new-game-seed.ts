import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import { PersistentComponent } from "../../engine/scene/persistent-component";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { ChronicleComponent } from "../chronicle/chronicle-component";
import { HitsplatStyleComponent } from "../hitsplat/hitsplat-style-component";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { spawnPrefab } from "../prefabs";

const PLAYER_PREFAB = "player";

export const newGameSeed = (world: World): void => {
	const player = spawnPrefab(world, PLAYER_PREFAB, Vector2.zero());
	if (player !== null) {
		world.ecs.addComponent(player, new PersistentComponent());
	}

	const narrative = [
		new InkStoryComponent(),
		new ChronicleComponent(),
		new PersistentComponent(),
	];
	world.ecs.createEntity(narrative);

	world.ecs.createEntity([
		new InteractionStateComponent(),
		new PersistentComponent(),
	]);
	world.ecs.createEntity([
		new HitsplatStyleComponent(),
		new PersistentComponent(),
	]);
};
