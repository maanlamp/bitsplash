import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { Camera2D } from "../src/engine/camera/camera-2d";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { Clock } from "../src/engine/clock";
import type {
	CutsceneApi,
	CutsceneDef,
} from "../src/engine/cutscene/cutscene";
import {
	CutsceneSystem,
	isCutsceneActive,
	startCutscene,
} from "../src/engine/cutscene/cutscene-system";
import { step } from "../src/engine/cutscene/verbs";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import { DialogueSystem } from "../src/engine/dialogue/dialogue-system";
import EventBus from "../src/engine/events";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { compileStory } from "../src/engine/ink/story";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { Input } from "../src/engine/input/input";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { SceneManager } from "../src/engine/scene/scene-manager";
import { Scene, SceneConfig } from "../src/engine/scene/scene";
import type { GlobalServices } from "../src/engine/services";
import type { Time } from "../src/engine/clock";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { dialogue, follow } from "../src/game/cutscene/verbs";
import { platformerDialogueBindings } from "../src/game/dialogue/dialogue-bindings";
import { createPlatformerActions } from "../src/game/input/platformer-actions";
import { PlayerInputComponent } from "../src/game/player/player-input-component";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const keys: Record<string, boolean> = {};
const snapshot: DeviceSnapshot = {
	keyboard: { keys },
	mouse: {
		buttons: {},
		position: { x: 0, y: 0 },
		wheel: { x: 0, y: 0 },
	},
	gamepads: {},
};

test("bun-game loop: a dialogue-ending cutscene releases the player and camera", () => {
	const world = new World({ x: 0, y: 20 });
	const ecs = world.ecs;
	const resolver = createPlatformerActions(new MemorySettingsStore());

	const player = ecs.createEntity([
		new PlayerInputComponent(),
		new TransformComponent(new Vector2(0, 0)),
	]);
	const npc = ecs.createEntity([
		new TransformComponent(new Vector2(10, 0)),
	]);
	const cameraEntity = ecs.createEntity([
		new Camera2DComponent(new Camera2D(), true, 0),
		new Camera2DFollowComponent({ targets: [player] }),
	]);

	const ink = new InkStoryComponent();
	ink.story = compileStory(
		{ "main.ink": "=== hello ===\n-> END\n" },
		"main.ink",
	);
	ecs.createEntity([ink]);

	ecs.addUpdateSystem(new DialogueSystem(platformerDialogueBindings));
	ecs.addUpdateSystem(new CutsceneSystem({ skipHeld: () => false }));

	const services: GlobalServices = {
		input: snapshot as unknown as Input,
		assetManager: { getFontFamilies: () => null } as never,
		audio: {} as never,
		clock: new Clock(),
		events: new EventBus(),
		settings: new MemorySettingsStore(),
	};
	const scenes = new SceneManager(services);
	const scene = new Scene({
		kind: "game",
		name: "test",
		config: new SceneConfig(),
		world,
		actions: resolver,
		gameplaySystems: [],
	});
	scenes.setBase(scene);

	const def: CutsceneDef = {
		id: "test:hello",
		scenes: [
			function* (api: CutsceneApi) {
				api.effect((ctx) => follow(ctx.ecs, [player, npc]));
				yield* step(api, "line", (a) => dialogue(a, "hello", npc));
				api.effect((ctx) => follow(ctx.ecs, [player]));
			},
		],
	};

	const stages = {
		started: false,
		dialogueOpened: false,
		dialogueClosed: false,
		ended: false,
	};

	let ms = 0;
	const frame = (press: boolean): void => {
		keys.E = press;
		ms += 16;
		const time = {
			elapsed: ms / 1000,
			dt: 0.016,
			scale: 1,
		} as unknown as Time;
		scenes.update({ dt: 16 as never, time });
		if (isCutsceneActive(ecs)) {
			stages.started = true;
		}
		const hasDialogue = ecs.query(DialogueComponent).length > 0;
		if (hasDialogue) {
			stages.dialogueOpened = true;
		}
		if (stages.dialogueOpened && !hasDialogue) {
			stages.dialogueClosed = true;
		}
		if (stages.started && !isCutsceneActive(ecs)) {
			stages.ended = true;
		}
		scene.world.events.clear();
	};

	startCutscene(ecs, def);
	for (let i = 0; i < 600 && !stages.ended; i++) {
		frame(i % 3 === 1);
	}

	expect(stages.started).toBe(true);
	expect(stages.dialogueOpened).toBe(true);
	expect(stages.dialogueClosed).toBe(true);
	expect(stages.ended).toBe(true);
	expect(
		ecs.getComponent(cameraEntity, Camera2DFollowComponent)!.targets,
	).toEqual([player]);
});
