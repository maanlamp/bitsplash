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
import { FacingSystem } from "../../engine/locomotion/facing-system";
import { FontSettings } from "../../engine/text/font-settings";
import {
	registerScene,
	registerSceneFile,
} from "../../engine/scene/registry";
import { Scene, type SceneFile } from "../../engine/scene/scene";
import { Camera2DFollowSystem } from "../../engine/camera/camera-2d-follow-system";
import { CameraShakeSystem } from "../../engine/camera/camera-shake-system";
import { CameraTransitionSystem } from "../../engine/camera/camera-transition-system";
import { SequenceSystem } from "../../engine/sequence/sequence-system";
import { TriggerVolumeSystem } from "../../engine/trigger/trigger-volume-system";
// Side-effect: register all sequence defs + op executors (2.11 manifest).
import "../sequence/sequence-manifest";
import { SequenceTriggerSystem } from "../sequence/sequence-trigger-system";
import { chronicleTriggerBindings } from "../sequence/trigger-bindings";
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
import { createPlatformerActions } from "../input/platformer-actions";
import { ACTION_IDS } from "../input/action-ids";
import { AimSystem } from "../aim/aim-system";
import { platformerDialogueBindings } from "../dialogue/dialogue-bindings";
import { spawnRuntimeEntities } from "./bootstrap";
import "../register-prefabs";
import { ArrowSystem } from "../combat/arrow-system";
import { BowSystem } from "../combat/bow-system";
import { BowRenderSystem } from "../combat/bow-render-system";
import { DamageShakeSystem } from "../combat/damage-shake-system";
import { DamageTriggerSystem } from "../combat/damage-trigger-system";
import { MeleeSystem } from "../combat/melee-system";
import { DeathSystem } from "../respawn/death-system";
import { DeathNoticeSystem } from "../respawn/death-notice-system";
import { BarkRenderSystem } from "../dialogue/bark-render-system";
import { BarkSystem } from "../dialogue/bark-system";
import { DialogueTriggerSystem } from "../dialogue/dialogue-trigger-system";
import { GroundDetectionSystem } from "../player/ground-detection-system";
import { HealthSystem } from "../health/health-system";
import { HealthBarSystem } from "../health/health-bar-system";
import { HitsplatSpawnSystem } from "../hitsplat/hitsplat-spawn-system";
import { HitsplatSystem } from "../hitsplat/hitsplat-system";
import { InteractOutlineRenderSystem } from "../interaction/interact-outline-render-system";
import { InteractionSystem } from "../interaction/interaction-system";
import { LocomotionSystem } from "../../engine/locomotion/locomotion-system";
import { NavAgentSystem } from "../../engine/nav/nav-agent-system";
import { NavGraphSystem } from "../../engine/nav/nav-graph-system";
import { FollowSystem } from "../follow/follow-system";
import { EnemyBrainSystem } from "../enemy/enemy-brain-system";
import { PerceptionSystem } from "../enemy/perception-system";
import { WanderSystem } from "../enemy/wander-system";
import { PickupSystem } from "../pickup/pickup-system";
import { NpcAnimationSystem } from "../npc/npc-animation-system";
import { PlayerAnimationSystem } from "../player/player-animation-system";
import { PlayerIntentSystem } from "../player/player-intent-system";
import { PlayerMovementSystem } from "../player/player-movement-system";
import { ChronicleInkMirrorSystem } from "../chronicle/chronicle-ink-mirror-system";
import { QuestSystem } from "../quest/quest-system";
import { QuestNoticeSystem } from "../quest/quest-notice-system";
import { SpawnSystem } from "../respawn/spawn-system";
import { VoiceSystem } from "../dialogue/voice-system";
import { createEditorHud } from "../ui/editor-hud";

import "./pause";

import.meta.glob("../*/*-def.ts", { eager: true });

registerScene("platformer", ({ config, name, services }): Scene => {
	const world = new World(config.gravity, collisionMatrix);
	const ecs = world.ecs;
	const actions = createPlatformerActions(services.settings);
	const hud = createEditorHud(services);

	ecs.addUpdateSystem(
		new TileCollisionSystem(CollisionLayer.Terrain),
	);
	ecs.addUpdateSystem(new NavGraphSystem(Math.abs(config.gravity.y)));
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
		new AimSystem(services.settings),
		new PlayerIntentSystem(),
		new EnemyBrainSystem(),
		new FacingSystem(),
		new PlayerAnimationSystem(),
		new NpcAnimationSystem(),
		new SpriteAnimationSystem(),
		new WanderSystem(),
		new FollowSystem(),
		new NavAgentSystem(),
		new PlayerMovementSystem(),
		new LocomotionSystem(),
		new GroundDetectionSystem(),
		new PhysicsSystem(),
		new BowSystem(),
		new ArrowSystem(),
		new MeleeSystem(),
		new PickupSystem(),
		new TriggerVolumeSystem(chronicleTriggerBindings),
		new SequenceTriggerSystem(),
		new InteractionSystem(),
		new DialogueTriggerSystem(),
		new DialogueSystem(platformerDialogueBindings),
		new BarkSystem(),
		new DamageTriggerSystem(),
		new HealthSystem(),
		new PerceptionSystem(),
		new DamageShakeSystem(),
		new HitsplatSpawnSystem(),
		new HitsplatSystem(),
		new DeathSystem(),
		new QuestSystem(),
		new ChronicleInkMirrorSystem(),
		new SequenceSystem({
			skipHeld: ({ actions }) =>
				actions.active(ACTION_IDS.cutsceneSkip),
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
		...hud.update,
	];

	ecs.addRenderSystem(
		new DecorationsRenderSystem(surfaceDecorations),
	);
	ecs.addRenderSystem(new DecorationsRenderSystem(tileDecorations));
	ecs.addRenderSystem(new DebugTagSystem("overlay"));
	ecs.addRenderSystem(new InteractOutlineRenderSystem("entities"));
	ecs.addRenderSystem(new BarkRenderSystem("overlay"));
	ecs.addRenderSystem(new SpriteRenderSystem());
	ecs.addRenderSystem(new BowRenderSystem());
	ecs.addRenderSystem(new TilemapRenderSystem());

	return new Scene({
		kind: "platformer",
		name,
		config,
		world,
		actions,
		ui: hud.ui,
		runtimeRenderSystems: hud.render,
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
			layer.tilesetRef.set(tilesetUrl);
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
