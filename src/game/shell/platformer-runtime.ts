import { Camera2DFollowSystem } from "../../engine/camera/camera-2d-follow-system";
import { CameraShakeSystem } from "../../engine/camera/camera-shake-system";
import { CameraTransitionSystem } from "../../engine/camera/camera-transition-system";
import { SequenceSystem } from "../../engine/sequence/sequence-system";
import { TriggerVolumeSystem } from "../../engine/trigger/trigger-volume-system";
// Side-effect: register all sequence defs + op executors (2.11 manifest).
import "../sequence/sequence-manifest";
import { SequenceTriggerSystem } from "../sequence/sequence-trigger-system";
import { chronicleTriggerBindings } from "../sequence/trigger-bindings";
import { DebugTagSystem } from "../../engine/debug/debug-tag-system";
import {
	SurfaceDecorations,
	TileDecorations,
} from "../../engine/decorations/decorations";
import { DecorationsRenderSystem } from "../../engine/decorations/decorations-render-system";
import { DialogueSystem } from "../../engine/dialogue/dialogue-system";
import { ScreenFadeSystem } from "../../engine/fade/screen-fade-system";
import { FacingSystem } from "../../engine/locomotion/facing-system";
import { LocomotionSystem } from "../../engine/locomotion/locomotion-system";
import { NavAgentSystem } from "../../engine/nav/nav-agent-system";
import { NavGraphSystem } from "../../engine/nav/nav-graph-system";
import { PhysicsSystem } from "../../engine/physics/physics-system";
import { Runtime } from "../../engine/runtime/runtime";
import {
	type SceneConfig,
	type SceneFile,
	toSceneConfig,
} from "../../engine/scene/scene";
import { SpriteAnimationSystem } from "../../engine/sprite/sprite-animation-system";
import { SpriteRenderSystem } from "../../engine/sprite/sprite-render-system";
import { TileCollisionSystem } from "../../engine/tilemap/tile-collision-system";
import { TilemapRenderSystem } from "../../engine/tilemap/tilemap-render-system";
import { TimerSystem } from "../../engine/timer/timer-system";
import { World } from "../../engine/world";
import { ArrowSystem } from "../combat/arrow-system";
import { BowRenderSystem } from "../combat/bow-render-system";
import { BowSystem } from "../combat/bow-system";
import { DamageShakeSystem } from "../combat/damage-shake-system";
import { DamageTriggerSystem } from "../combat/damage-trigger-system";
import { MeleeSystem } from "../combat/melee-system";
import { ChronicleInkMirrorSystem } from "../chronicle/chronicle-ink-mirror-system";
import { Layer, collisionMatrix } from "../collision";
import {
	SURFACE_DECORATION_DENSITY,
	SURFACE_DECORATION_JITTER,
	TILE_DECORATION_DENSITY,
} from "../constants";
import knickKnacksUrl from "../content/assets/knick-knacks-grass.png";
import tileDecorationsUrl from "../content/assets/tile-decorations.png";
import { BarkRenderSystem } from "../dialogue/bark-render-system";
import { BarkSystem } from "../dialogue/bark-system";
import { platformerDialogueBindings } from "../dialogue/dialogue-bindings";
import { DialogueTriggerSystem } from "../dialogue/dialogue-trigger-system";
import { VoiceSystem } from "../dialogue/voice-system";
import { EnemyBrainSystem } from "../enemy/enemy-brain-system";
import { PerceptionSystem } from "../enemy/perception-system";
import { WanderSystem } from "../enemy/wander-system";
import { FollowSystem } from "../follow/follow-system";
import { HealthBarSystem } from "../health/health-bar-system";
import { HealthSystem } from "../health/health-system";
import { HitsplatSpawnSystem } from "../hitsplat/hitsplat-spawn-system";
import { HitsplatSystem } from "../hitsplat/hitsplat-system";
import { ACTION_IDS } from "../input/action-ids";
import { AimSystem } from "../aim/aim-system";
import { InteractOutlineRenderSystem } from "../interaction/interact-outline-render-system";
import { InteractionSystem } from "../interaction/interaction-system";
import { NpcAnimationSystem } from "../npc/npc-animation-system";
import { GroundDetectionSystem } from "../player/ground-detection-system";
import { PlayerAnimationSystem } from "../player/player-animation-system";
import { PlayerIntentSystem } from "../player/player-intent-system";
import { PlayerMovementSystem } from "../player/player-movement-system";
import { PickupSystem } from "../pickup/pickup-system";
import { bootGame } from "../runtime/boot-game";
import { QuestNoticeSystem } from "../quest/quest-notice-system";
import { QuestSystem } from "../quest/quest-system";
import { DeathNoticeSystem } from "../respawn/death-notice-system";
import { DeathSystem } from "../respawn/death-system";
import { SpawnSystem } from "../respawn/spawn-system";
import { newGameSeed } from "../runtime/new-game-seed";
import {
	type AuthoredScene,
	toSceneDefinition,
} from "../runtime/scene-runtime";

export const INITIAL_SCENE = "demo";

const sceneFiles = import.meta.glob(
	"../content/levels/*.scene.json",
	{
		eager: true,
	},
);

const files = new Map<string, SceneFile>();
for (const [path, mod] of Object.entries(sceneFiles)) {
	const id = path
		.split("/")
		.pop()!
		.replace(/\.scene\.json$/, "");
	files.set(id, (mod as { default: SceneFile }).default);
}

export const resolveScene = (id: string): AuthoredScene => {
	const file = files.get(id);
	if (!file) {
		throw new Error(`Unknown scene id: ${id}`);
	}
	return {
		config: toSceneConfig(file.config),
		entities: file.entities,
		bounds: null,
	};
};

const registerSystems = (world: World, config: SceneConfig): void => {
	const ecs = world.ecs;

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

	const updateSystems = [
		new TileCollisionSystem(Layer.Terrain),
		new NavGraphSystem(Math.abs(config.gravity.y)),
		new AimSystem(),
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
	];
	for (const system of updateSystems) {
		ecs.addUpdateSystem(system);
	}

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
};

export const createFreshRuntime = (): Runtime => {
	const config = resolveScene(INITIAL_SCENE).config;
	const world = new World(config.gravity, collisionMatrix);
	registerSystems(world, config);
	return new Runtime({
		world,
		seed: newGameSeed,
		resolveScene: (id) => toSceneDefinition(resolveScene(id)),
	});
};

export const startNewRuntime = (): Runtime =>
	bootGame({
		initialScene: INITIAL_SCENE,
		resolveScene,
		registerSystems: (world) =>
			registerSystems(world, resolveScene(INITIAL_SCENE).config),
	});
