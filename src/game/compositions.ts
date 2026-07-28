import { Camera2DFollowSystem } from "../engine/camera/camera-2d-follow-system";
import { CameraShakeSystem } from "../engine/camera/camera-shake-system";
import { CameraTransitionSystem } from "../engine/camera/camera-transition-system";
import {
	SurfaceDecorations,
	TileDecorations,
} from "../engine/decorations/decorations";
import { DecorationsRenderSystem } from "../engine/decorations/decorations-render-system";
import { DebugTagSystem } from "../engine/debug/debug-tag-system";
import { DialogueSystem } from "../engine/dialogue/dialogue-system";
import { ScreenFadeSystem } from "../engine/fade/screen-fade-system";
import { FacingSystem } from "../engine/locomotion/facing-system";
import { LocomotionSystem } from "../engine/locomotion/locomotion-system";
import { NavAgentSystem } from "../engine/nav/nav-agent-system";
import { NavGraphSystem } from "../engine/nav/nav-graph-system";
import { PhysicsSystem } from "../engine/physics/physics-system";
import type {
	Composition,
	CompositionSystems,
} from "../engine/runtime/game-module";
import type { SettingsStore } from "../engine/input/settings-store";
import { SequenceSystem } from "../engine/sequence/sequence-system";
import { SpriteAnimationSystem } from "../engine/sprite/sprite-animation-system";
import { SpriteRenderSystem } from "../engine/sprite/sprite-render-system";
import { StaticAnimationSystem } from "../engine/sprite/static-animation-system";
import { SpriteTagPlaybackSystem } from "../engine/sprite/sprite-tag-playback-system";
import type { RenderSystem, UpdateSystem } from "../engine/system";
import { TileCollisionSystem } from "../engine/tilemap/tile-collision-system";
import { TilemapRenderSystem } from "../engine/tilemap/tilemap-render-system";
import { TimerSystem } from "../engine/timer/timer-system";
import { TriggerVolumeSystem } from "../engine/trigger/trigger-volume-system";
import { AimSystem } from "./aim/aim-system";
import { ChronicleInkMirrorSystem } from "./chronicle/chronicle-ink-mirror-system";
import { Layer } from "./collision";
import { ArrowSystem } from "./combat/arrow-system";
import { BowRenderSystem } from "./combat/bow-render-system";
import { BowSystem } from "./combat/bow-system";
import { DamageShakeSystem } from "./combat/damage-shake-system";
import { DamageTriggerSystem } from "./combat/damage-trigger-system";
import { MeleeSystem } from "./combat/melee-system";
import {
	SURFACE_DECORATION_DENSITY,
	SURFACE_DECORATION_JITTER,
	TILE_DECORATION_DENSITY,
} from "./constants";
import knickKnacksUrl from "./content/assets/knick-knacks-grass.png";
import tileDecorationsUrl from "./content/assets/tile-decorations.png";
import { BarkSystem } from "./dialogue/bark-system";
import { platformerDialogueBindings } from "./dialogue/dialogue-bindings";
import { DialogueTriggerSystem } from "./dialogue/dialogue-trigger-system";
import { VoiceSystem } from "./dialogue/voice-system";
import { EnemyBrainSystem } from "./enemy/enemy-brain-system";
import { PerceptionSystem } from "./enemy/perception-system";
import { WanderSystem } from "./enemy/wander-system";
import { FollowSystem } from "./follow/follow-system";
import { HealthBarSystem } from "./health/health-bar-system";
import { HealthSystem } from "./health/health-system";
import { HitsplatSpawnSystem } from "./hitsplat/hitsplat-spawn-system";
import { HitsplatSystem } from "./hitsplat/hitsplat-system";
import { ACTION_IDS } from "./input/action-ids";
import { InteractOutlineRenderSystem } from "./interaction/interact-outline-render-system";
import { InteractionSystem } from "./interaction/interaction-system";
import { NpcAnimationSystem } from "./npc/npc-animation-system";
import { NpcScanSystem } from "./npc/npc-scan-system";
import { PickupSystem } from "./pickup/pickup-system";
import { GroundDetectionSystem } from "./player/ground-detection-system";
import { PlayerAnimationSystem } from "./player/player-animation-system";
import { PlayerIntentSystem } from "./player/player-intent-system";
import { PlayerMovementSystem } from "./player/player-movement-system";
import { QuestNoticeSystem } from "./quest/quest-notice-system";
import { QuestSystem } from "./quest/quest-system";
import { ReactionSystem } from "./reaction/reaction-system";
import { DeathNoticeSystem } from "./respawn/death-notice-system";
import { DeathSystem } from "./respawn/death-system";
import { SpawnSystem } from "./respawn/spawn-system";
import { SequenceTriggerSystem } from "./sequence/sequence-trigger-system";
import { chronicleTriggerBindings } from "./sequence/trigger-bindings";

/**
 * Systems that maintain the live edit world: tile collision bodies and the nav
 * graph. Present in the bundled game and in the editor's edit mode; absent from
 * the pure gameplay list because they are world-derivation, not gameplay.
 */
const editWorldSystems = (gravityY: number): UpdateSystem[] => [
	new TileCollisionSystem(Layer.Terrain),
	new NavGraphSystem(Math.abs(gravityY)),
];

/**
 * The full ordered gameplay update list, from aim through camera. Identical
 * across the bundled game and the editor run host — the single source of truth
 * that the two roots used to duplicate.
 */
const gameplaySystems = (settings: SettingsStore): UpdateSystem[] => [
	new AimSystem(settings),
	new PlayerIntentSystem(),
	new EnemyBrainSystem(),
	new NpcScanSystem(),
	new FacingSystem(),
	new PlayerAnimationSystem(),
	new NpcAnimationSystem(),
	new SpriteAnimationSystem(),
	new StaticAnimationSystem(),
	new SpriteTagPlaybackSystem(),
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
	new ReactionSystem(),
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

/**
 * The ordered render list. Shared by the bundled game and the editor edit
 * world (both draw the level while authoring or playing).
 */
const renderSystems = (): RenderSystem[] => {
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
	return [
		new DecorationsRenderSystem(surfaceDecorations),
		new DecorationsRenderSystem(tileDecorations),
		new DebugTagSystem("overlay"),
		new InteractOutlineRenderSystem("entities"),
		new SpriteRenderSystem(),
		new BowRenderSystem(),
		new TilemapRenderSystem(),
	];
};

/**
 * The bundled game: edit-world maintenance, the full gameplay list, and the
 * render list, all added to one world.
 */
export const game: Composition = ({
	settings,
	gravityY,
}): CompositionSystems => ({
	update: [
		...editWorldSystems(gravityY),
		...gameplaySystems(settings),
	],
	render: renderSystems(),
});

/**
 * The editor run host: the same gameplay list as {@link game}, plus the HUD
 * systems. Edit-world maintenance and the base render list belong to the edit
 * composition that is already live on the world.
 */
export const editorRun: Composition = ({
	settings,
	hud,
}): CompositionSystems => ({
	update: [...gameplaySystems(settings), ...(hud?.update ?? [])],
	render: [...(hud?.render ?? [])],
});

/**
 * The editor edit world: render systems plus tile-collision and nav-graph
 * maintenance only. No gameplay, no physics — the authored world is drawn and
 * kept consistent while editing, never simulated.
 */
export const editorEdit: Composition = ({
	gravityY,
}): CompositionSystems => ({
	update: editWorldSystems(gravityY),
	render: renderSystems(),
});
