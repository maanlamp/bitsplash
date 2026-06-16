import { DebugTagComponent } from "../../engine/components/debug-tag";
import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import {
	SurfaceDecorations,
	TileDecorations,
} from "../../engine/decorations";
import { DialogueSystem } from "../../engine/dialogue/dialogue-system";
import { FontSettings } from "../../engine/font-settings";
import { StateMachineSystem } from "../../engine/fsm/state-machine-system";
import {
	registerScene,
	registerSceneFile,
} from "../../engine/scene/registry";
import { Scene, type SceneFile } from "../../engine/scene/scene";
import { Camera2DFollowSystem } from "../../engine/systems/camera-2d-follow";
import { CameraShakeSystem } from "../../engine/systems/camera-shake";
import { DebugTagSystem } from "../../engine/systems/debug-tag";
import { DecorationsRenderSystem } from "../../engine/systems/decorations-render";
import { PhysicsSystem } from "../../engine/systems/physics";
import { PhysicsBodySystem } from "../../engine/systems/physics-body";
import { SpriteRenderSystem } from "../../engine/systems/sprite-render";
import { TilemapRenderSystem } from "../../engine/systems/tilemap-render";
import { TimerSystem } from "../../engine/systems/timer";
import { TileCollisionBaker } from "../../engine/tilemap/collision";
import { TileGrid } from "../../engine/tilemap/grid";
import type Vector2 from "../../engine/vector2";
import { World } from "../../engine/world";
import tilesetUrl from "../assets/dirt.tileset.png";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";
import knickKnacksUrl from "../assets/knick-knacks-grass.png";
import tileDecorationsUrl from "../assets/tile-decorations.png";
import { platformerDialogueBindings } from "../dialogue-bindings";
import { spawnRuntimeEntities } from "../levels/demo";
import { ArrowSystem } from "../systems/arrow";
import { BowSystem } from "../systems/bow";
import { DamageShakeSystem } from "../systems/damage-shake";
import { DamageTriggerSystem } from "../systems/damage-trigger";
import { DeathSystem } from "../systems/death";
import { DeathNoticeSystem } from "../systems/death-notice";
import { DeathOverlayRenderSystem } from "../systems/death-overlay-render";
import { DialogueRenderSystem } from "../systems/dialogue-render";
import { DialogueTriggerSystem } from "../systems/dialogue-trigger";
import { GroundDetectionSystem } from "../systems/ground-detection";
import { HealthSystem } from "../systems/health";
import { HealthBarSystem } from "../systems/health-bar";
import HealthRenderSystem from "../systems/health-render";
import { InteractHintRenderSystem } from "../systems/interact-hint-render";
import { InteractionSystem } from "../systems/interaction";
import { ObjectiveRenderSystem } from "../systems/objective-render";
import { PatrolSystem } from "../systems/patrol";
import { PickupSystem } from "../systems/pickup";
import { PlayerInputSystem } from "../systems/player-input";
import { PlayerMovementStateSystem } from "../systems/player-movement-state";
import { QuestSystem } from "../systems/quest";
import { QuestNoticeSystem } from "../systems/quest-notice";
import { QuestNoticeRenderSystem } from "../systems/quest-notice-render";
import { SpawnSystem } from "../systems/spawn";
import { TileUnstuckSystem } from "../systems/tile-unstuck";
import { VoiceSystem } from "../systems/voice";

import "./pause";

import.meta.glob("../fsm/*", { eager: true });

export const Layer = {
	SURFACE_DECO_BACK: 10,
	PLAYER: 20,
	SURFACE_DECO_FRONT: 30,
	TILEMAP: 40,
	TILE_DECO: 45,
	DEBUG_TAG: 90,
} as const;

registerScene("platformer", ({ config, name }): Scene => {
	const world = new World(config.gravity);
	const ecs = world.ecs;

	const tileGrid = new TileGrid();
	new TileCollisionBaker(tileGrid, world);
	const surfaceDecorations = new SurfaceDecorations(
		tileGrid,
		knickKnacksUrl,
		Layer.SURFACE_DECO_BACK,
		Layer.SURFACE_DECO_FRONT,
	);
	const tileDecorations = new TileDecorations(
		tileGrid,
		tileDecorationsUrl,
		Layer.TILE_DECO,
	);

	const gameplaySystems = [
		new PhysicsBodySystem(),
		new PlayerMovementStateSystem(),
		new PlayerInputSystem(),
		new StateMachineSystem(),
		new PatrolSystem(),
		new GroundDetectionSystem(),
		new PhysicsSystem(),
		new TileUnstuckSystem(tileGrid),
		new BowSystem(),
		new ArrowSystem(tileGrid),
		new PickupSystem(),
		new InteractionSystem(),
		new DialogueTriggerSystem(),
		new DialogueSystem(platformerDialogueBindings),
		new DamageTriggerSystem(),
		new HealthSystem(),
		new DamageShakeSystem(),
		new DeathSystem(),
		new QuestSystem(),
		new TimerSystem(),
		new SpawnSystem(),
		new DeathNoticeSystem(),
		new QuestNoticeSystem(),
		new HealthBarSystem(),
		new VoiceSystem(),
		new Camera2DFollowSystem(),
		new CameraShakeSystem(),
	];

	ecs.addRenderSystem(
		new DecorationsRenderSystem(surfaceDecorations),
	);
	ecs.addRenderSystem(new DecorationsRenderSystem(tileDecorations));
	ecs.addRenderSystem(new DebugTagSystem(Layer.DEBUG_TAG));
	ecs.addRenderSystem(
		new InteractHintRenderSystem(Layer.DEBUG_TAG, Layer.PLAYER),
	);
	ecs.addRenderSystem(new DialogueRenderSystem());
	ecs.addRenderSystem(new SpriteRenderSystem(Layer.PLAYER));
	ecs.addRenderSystem(
		new TilemapRenderSystem(tileGrid, tilesetUrl, Layer.TILEMAP),
	);
	ecs.addRenderSystem(new HealthRenderSystem(Layer.TILEMAP));
	ecs.addRenderSystem(new DeathOverlayRenderSystem());
	ecs.addRenderSystem(new QuestNoticeRenderSystem());
	ecs.addRenderSystem(new ObjectiveRenderSystem());

	return new Scene({
		kind: "platformer",
		name,
		config,
		world,
		tileGrid,
		gameplaySystems,
		spawnRuntimeEntities: () =>
			spawnRuntimeEntities({ tileGrid, world }),
		defaultEntity: (position: Vector2) => [
			new TransformComponent(position),
			new SpriteComponent(),
			new DebugTagComponent(
				"entity",
				new FontSettings(fsPixelSansUrl),
			),
		],
	});
});

const sceneFiles = import.meta.glob("../levels/*.scene.json", {
	eager: true,
});
for (const [path, mod] of Object.entries(sceneFiles)) {
	const id = path
		.split("/")
		.pop()!
		.replace(/\.scene\.json$/, "");
	registerSceneFile(
		id,
		(mod as { default: unknown }).default as SceneFile,
	);
}

if (import.meta.hot) {
	import.meta.hot.accept(() => {
		window.location.reload();
	});
}
