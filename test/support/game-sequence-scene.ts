import type { ECS } from "../../src/engine/ecs";
import type { SceneDefinition } from "../../src/engine/runtime/runtime";
import { SceneConfig } from "../../src/engine/scene/scene";
import { ScreenFadeSystem } from "../../src/engine/fade/screen-fade-system";
import { compileStory } from "../../src/engine/ink/story";
import { InkStoryComponent } from "../../src/engine/ink/ink-story-component";
import { registerSequenceDef } from "../../src/engine/sequence/sequence-system";
import { SequenceComponent } from "../../src/engine/sequence/sequence-component";
import type { SequenceDef } from "../../src/engine/sequence/sequence-def";
import { SequenceSystem } from "../../src/engine/sequence/sequence-system";
import type { World } from "../../src/engine/world";
import { registerSequenceContent } from "../../src/game/sequence/sequence-manifest";
import { registerTestSequenceOps } from "./sequence-scene";

export const inkStoryComponent = (
	source: string,
): InkStoryComponent => {
	const component = new InkStoryComponent();
	component.story = compileStory({ "main.ink": source }, "main.ink");
	return component;
};

export const rehydrateInkStory = (ecs: ECS, source: string): void => {
	const entry = ecs.query(InkStoryComponent)[0];
	if (!entry) {
		return;
	}
	const component = entry[1];
	const story = compileStory({ "main.ink": source }, "main.ink");
	if (component.state) {
		story.state.LoadJson(component.state);
	}
	component.story = story;
};

export type GameSequenceSceneOptions = Readonly<{
	def: SequenceDef;
	seedScene?: (world: World) => void;
	seedSequence?: (component: SequenceComponent) => void;
	skipHeld?: () => boolean;
	extraSystems?: (world: World) => void;
}>;

const SCENE_ID = "game-sequence-test";

export const gameSequenceSceneConfig = (
	options: GameSequenceSceneOptions,
) => {
	registerSequenceContent();
	registerTestSequenceOps();
	registerSequenceDef(options.def);

	const scene: SceneDefinition = {
		config: new SceneConfig(),
		build: (world: World): void => {
			options.seedScene?.(world);
			const component = new SequenceComponent(options.def);
			options.seedSequence?.(component);
			world.ecs.createEntity([component]);
		},
	};

	return {
		initialScene: SCENE_ID,
		seed: (): void => {},
		resolveScene: (): SceneDefinition => scene,
		registerSystems: (world: World): void => {
			world.ecs.addUpdateSystem(
				new SequenceSystem({
					skipHeld: () => options.skipHeld?.() ?? false,
				}),
			);
			world.ecs.addUpdateSystem(new ScreenFadeSystem());
			options.extraSystems?.(world);
		},
	};
};
