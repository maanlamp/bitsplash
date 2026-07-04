import { DebugTagComponent } from "../../engine/debug/debug-tag-component";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import { TransformComponent } from "../../engine/transform-component";
import {
	Layer as CollisionLayer,
	collisionMatrix,
} from "../collision";
import {
	SURFACE_DECORATION_DENSITY,
	SURFACE_DECORATION_JITTER,
	TILE_DECORATION_DENSITY,
} from "../constants";
import {
	SurfaceDecorations,
	TileDecorations,
} from "../../engine/decorations/decorations";
import { DialogueSystem } from "../../engine/dialogue/dialogue-system";
import { FontSettings } from "../../engine/text/font-settings";
import { StateMachineSystem } from "../../engine/fsm/state-machine-system";
import {
	registerScene,
	registerSceneFile,
} from "../../engine/scene/registry";
import { Scene, type SceneFile } from "../../engine/scene/scene";
import { Camera2DFollowSystem } from "../../engine/camera/camera-2d-follow-system";
import { CameraShakeSystem } from "../../engine/camera/camera-shake-system";
import { CameraTransitionSystem } from "../../engine/camera/camera-transition-system";
import { CutsceneSystem } from "../../engine/cutscene/cutscene-system";
import { ScreenFadeRenderSystem } from "../../engine/fade/screen-fade-render-system";
import { ScreenFadeSystem } from "../../engine/fade/screen-fade-system";
import { DebugTagSystem } from "../../engine/debug/debug-tag-system";
import { DecorationsRenderSystem } from "../../engine/decorations/decorations-render-system";
import { PhysicsSystem } from "../../engine/physics/physics-system";
import { SpriteAnimationSystem } from "../../engine/sprite/sprite-animation-system";
import { SpriteRenderSystem } from "../../engine/sprite/sprite-render-system";
import { TilemapRenderSystem } from "../../engine/tilemap/tilemap-render-system";
import { TimerSystem } from "../../engine/timer/timer-system";
import { TileCollisionSystem } from "../../engine/tilemap/tile-collision-system";
import { TileLayerComponent } from "../../engine/tilemap/tile-layer-component";
import type Vector2 from "../../engine/vector2";
import { World } from "../../engine/world";
import tilesetUrl from "../content/assets/dirt.tileset.png";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";
import knickKnacksUrl from "../content/assets/knick-knacks-grass.png";
import tileDecorationsUrl from "../content/assets/tile-decorations.png";
import { InputBindings } from "../input-bindings";
import { platformerDialogueBindings } from "../dialogue/dialogue-bindings";
import { spawnRuntimeEntities } from "./bootstrap";
import { ArrowSystem } from "../combat/arrow-system";
import { BowSystem } from "../combat/bow-system";
import { DamageShakeSystem } from "../combat/damage-shake-system";
import { DamageTriggerSystem } from "../combat/damage-trigger-system";
import { DeathSystem } from "../respawn/death-system";
import { DeathNoticeSystem } from "../respawn/death-notice-system";
import { DeathOverlayRenderSystem } from "../respawn/death-overlay-render-system";
import { DialogueRenderSystem } from "../dialogue/dialogue-render-system";
import { DialogueTriggerSystem } from "../dialogue/dialogue-trigger-system";
import { GroundDetectionSystem } from "../player/ground-detection-system";
import { HealthSystem } from "../health/health-system";
import { HealthBarSystem } from "../health/health-bar-system";
import { HealthRenderSystem } from "../health/health-render-system";
import { InteractHintRenderSystem } from "../interaction/interact-hint-render-system";
import { InteractionSystem } from "../interaction/interaction-system";
import { ObjectiveRenderSystem } from "../quest/objective-render-system";
import { PatrolSystem } from "../enemy/patrol-system";
import { PickupSystem } from "../pickup/pickup-system";
import { PlayerAnimationSystem } from "../player/player-animation-system";
import { PlayerInputSystem } from "../player/player-input-system";
import { QuestSystem } from "../quest/quest-system";
import { QuestNoticeSystem } from "../quest/quest-notice-system";
import { QuestNoticeRenderSystem } from "../quest/quest-notice-render-system";
import { QuestMarkerRenderSystem } from "../quest/quest-marker-render-system";
import { SpawnSystem } from "../respawn/spawn-system";
import { VoiceSystem } from "../dialogue/voice-system";

import "./pause";

import.meta.glob("../*/*-def.ts", { eager: true });

registerScene("platformer", ({ config, name }): Scene => {
	const world = new World(config.gravity, collisionMatrix);
	const ecs = world.ecs;

	ecs.addUpdateSystem(
		new TileCollisionSystem(CollisionLayer.Terrain),
	);
	const surfaceDecorations = new SurfaceDecorations(
		knickKnacksUrl,
		"background",
		"foreground",
		SURFACE_DECORATION_DENSITY,
		SURFACE_DECORATION_JITTER,
	);
	const tileDecorations = new TileDecorations(
		tileDecorationsUrl,
		"terrain",
		TILE_DECORATION_DENSITY,
		10,
	);

	const gameplaySystems = [
		new PlayerInputSystem(),
		new StateMachineSystem(),
		new PlayerAnimationSystem(),
		new SpriteAnimationSystem(),
		new PatrolSystem(),
		new GroundDetectionSystem(),
		new PhysicsSystem(),
		new BowSystem(),
		new ArrowSystem(),
		new PickupSystem(),
		new InteractionSystem(),
		new DialogueTriggerSystem(),
		new DialogueSystem(platformerDialogueBindings),
		new DamageTriggerSystem(),
		new HealthSystem(),
		new DamageShakeSystem(),
		new DeathSystem(),
		new QuestSystem(),
		new CutsceneSystem({
			skipHeld: ({ input }) =>
				!!input.keyboard.keys[InputBindings.interact],
		}),
		new TimerSystem(),
		new SpawnSystem(),
		new DeathNoticeSystem(),
		new QuestNoticeSystem(),
		new HealthBarSystem(),
		new VoiceSystem(),
		new Camera2DFollowSystem(),
		new ScreenFadeSystem(),
		new CameraTransitionSystem(),
		new CameraShakeSystem(),
	];

	ecs.addRenderSystem(
		new DecorationsRenderSystem(surfaceDecorations),
	);
	ecs.addRenderSystem(new DecorationsRenderSystem(tileDecorations));
	ecs.addRenderSystem(new DebugTagSystem("overlay"));
	ecs.addRenderSystem(new QuestMarkerRenderSystem("overlay"));
	ecs.addRenderSystem(
		new InteractHintRenderSystem("overlay", "entities"),
	);
	ecs.addRenderSystem(new DialogueRenderSystem());
	ecs.addRenderSystem(new SpriteRenderSystem());
	ecs.addRenderSystem(new TilemapRenderSystem());
	ecs.addRenderSystem(new HealthRenderSystem("terrain"));
	ecs.addRenderSystem(new DeathOverlayRenderSystem());
	ecs.addRenderSystem(new QuestNoticeRenderSystem());
	ecs.addRenderSystem(new ObjectiveRenderSystem());
	ecs.addRenderSystem(new ScreenFadeRenderSystem());

	return new Scene({
		kind: "platformer",
		name,
		config,
		world,
		gameplaySystems,
		spawnRuntimeEntities: () => spawnRuntimeEntities({ world }),
		defaultEntity: (position: Vector2) => [
			new TransformComponent(position),
			new SpriteComponent(),
			new DebugTagComponent(
				"entity",
				new FontSettings(fsPixelSansUrl),
			),
		],
		migrateFile: (file) => {
			if (!file.tiles?.length || ecs.query(TileLayerComponent)[0]) {
				return;
			}
			const layer = new TileLayerComponent();
			layer.name = "terrain";
			layer.tileset = tilesetUrl;
			layer.cells = file.tiles;
			ecs.createEntity([layer]);
		},
	});
});

const sceneFiles = import.meta.glob(
	"../content/levels/*.scene.json",
	{
		eager: true,
	},
);
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
