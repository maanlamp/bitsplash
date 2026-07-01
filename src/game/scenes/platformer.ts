import { DebugTagComponent } from "../../engine/components/debug-tag";
import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import {
	Layer as CollisionLayer,
	collisionMatrix,
} from "../collision";
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
import { ScreenFadeRenderSystem } from "../../engine/systems/screen-fade-render";
import { DebugTagSystem } from "../../engine/systems/debug-tag";
import { DecorationsRenderSystem } from "../../engine/systems/decorations-render";
import { PhysicsSystem } from "../../engine/systems/physics";
import { SpriteAnimationSystem } from "../../engine/systems/sprite-animation";
import { SpriteRenderSystem } from "../../engine/systems/sprite-render";
import { TilemapRenderSystem } from "../../engine/systems/tilemap-render";
import { TimerSystem } from "../../engine/systems/timer";
import { TileCollisionBaker } from "../../engine/tilemap/collision";
import { TileGrid } from "../../engine/tilemap/grid";
import type Vector2 from "../../engine/vector2";
import { World } from "../../engine/world";
import tilesetUrl from "../content/assets/dirt.tileset.png";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";
import knickKnacksUrl from "../content/assets/knick-knacks-grass.png";
import tileDecorationsUrl from "../content/assets/tile-decorations.png";
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
import HealthRenderSystem from "../health/health-render-system";
import { InteractHintRenderSystem } from "../interaction/interact-hint-render-system";
import { InteractionSystem } from "../interaction/interaction-system";
import { ObjectiveRenderSystem } from "../quest/objective-render-system";
import { PatrolSystem } from "../enemy/patrol-system";
import { PickupSystem } from "../pickup/pickup-system";
import { PickupTourSystem } from "../quest/pickup-tour-system";
import { PlayerAnimationSystem } from "../player/player-animation-system";
import { PlayerInputSystem } from "../player/player-input-system";
import { QuestSystem } from "../quest/quest-system";
import { QuestNoticeSystem } from "../quest/quest-notice-system";
import { QuestNoticeRenderSystem } from "../quest/quest-notice-render-system";
import { QuestMarkerDrawerSystem } from "../quest/quest-marker-drawer-system";
import { SpawnSystem } from "../respawn/spawn-system";
import { VoiceSystem } from "../dialogue/voice-system";

import "./pause";

import.meta.glob("../*/*-def.ts", { eager: true });

export const Layer = {
	SURFACE_DECO_BACK: 10,
	PLAYER: 20,
	SURFACE_DECO_FRONT: 30,
	TILEMAP: 40,
	TILE_DECO: 45,
	DEBUG_TAG: 90,
} as const;

registerScene("platformer", ({ config, name }): Scene => {
	const world = new World(config.gravity, collisionMatrix);
	const ecs = world.ecs;

	const tileGrid = new TileGrid();
	new TileCollisionBaker(tileGrid, world, CollisionLayer.Terrain);
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
		new PlayerInputSystem(),
		new StateMachineSystem(),
		new PlayerAnimationSystem(),
		new SpriteAnimationSystem(),
		new PatrolSystem(),
		new GroundDetectionSystem(),
		new PhysicsSystem(),
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
		new PickupTourSystem(),
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
	ecs.addRenderSystem(new QuestMarkerDrawerSystem(Layer.DEBUG_TAG));
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
	ecs.addRenderSystem(new ScreenFadeRenderSystem());

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
