import type { SceneDefinition } from "../../src/engine/runtime/runtime";
import { PersistentComponent } from "../../src/engine/scene/persistent-component";
import { SceneConfig } from "../../src/engine/scene/scene";
import {
	serializable,
	serialize,
} from "../../src/engine/serialization/serializable";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../src/engine/system";
import type { World } from "../../src/engine/world";

@serializable("HarnessCounter")
export class HarnessCounterComponent {
	@serialize() ticks = 0;
}

export class HarnessCounterSystem extends UpdateSystem {
	update(ctx: UpdateContext): void {
		for (const [, counter] of ctx.ecs.query(
			HarnessCounterComponent,
		)) {
			counter.ticks += 1;
		}
	}
}

const SCENE_ID = "harness-scene";

const config = (): SceneConfig => new SceneConfig();

const seed = (world: World): void => {
	world.ecs.createEntity([
		new HarnessCounterComponent(),
		new PersistentComponent(),
	]);
};

const build = (world: World): void => {
	world.ecs.createEntity([new HarnessCounterComponent()]);
};

export const counterScene: SceneDefinition = {
	config: config(),
	build,
};

export const counterHarnessConfig = {
	initialScene: SCENE_ID,
	seed,
	resolveScene: (_id: string): SceneDefinition => counterScene,
	registerSystems: (world: World): void => {
		world.ecs.addUpdateSystem(new HarnessCounterSystem());
	},
};
