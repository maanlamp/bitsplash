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
import { LightningFlashRenderSystem } from "../engine/fade/lightning-flash-render-system";
import { LightningFlashSystem } from "../engine/fade/lightning-flash-system";
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
import { SkyRenderSystem } from "../engine/sky/sky-render-system";
import { SpriteAnimationSystem } from "../engine/sprite/sprite-animation-system";
import { SpriteRenderSystem } from "../engine/sprite/sprite-render-system";
import { StaticAnimationSystem } from "../engine/sprite/static-animation-system";
import { SpriteTagPlaybackSystem } from "../engine/sprite/sprite-tag-playback-system";
import type { RenderSystem, UpdateSystem } from "../engine/system";
import { TileCollisionSystem } from "../engine/tilemap/tile-collision-system";
import { TilemapRenderSystem } from "../engine/tilemap/tilemap-render-system";
import { TimerSystem } from "../engine/timer/timer-system";
import { TriggerVolumeSystem } from "../engine/trigger/trigger-volume-system";
import { createVfxSystems } from "../engine/vfx/vfx-systems";
import type { VfxUpdateSystem } from "../engine/vfx/vfx-update-system";
import { AmbientClockSystem } from "../engine/weather/ambient-clock";
import { LightningRenderSystem } from "../engine/weather/lightning-render-system";
import { LightningSystem } from "../engine/weather/lightning-system";
import { WeatherAudioSystem } from "../engine/weather/weather-audio-system";
import { WeatherPresentationSystem } from "../engine/weather/weather-presentation-system";
import { WeatherSchedulerSystem } from "../engine/weather/weather-scheduler-system";
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
import { DpsMeterSystem } from "./dps-meter/dps-meter-system";
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
import { QuestSystem } from "./quest/quest-system";
import { ReactionSystem } from "./reaction/reaction-system";
import { DeathSystem } from "./respawn/death-system";
import { SpawnSystem } from "./respawn/spawn-system";
import { SequenceTriggerSystem } from "./sequence/sequence-trigger-system";
import { chronicleTriggerBindings } from "./sequence/trigger-bindings";
import { NoticeSystem } from "./ui/notice-system";
import { BloodVfxSystem } from "./vfx/blood-vfx-system";
import { DebugLootBeamSystem } from "./vfx/debug-loot-beam-system";
import { ThunderSystem } from "./weather/thunder-system";

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
	new DebugLootBeamSystem(),
	new QuestSystem(),
	new ChronicleInkMirrorSystem(),
	new SequenceSystem({
		skipHeld: ({ actions }) =>
			actions.active(ACTION_IDS.cutsceneSkip),
	}),
	new TimerSystem(),
	new WeatherSchedulerSystem(),
	new SpawnSystem(),
	new NoticeSystem(),
	new HealthBarSystem(),
	new DpsMeterSystem(),
	new VoiceSystem(),
	new Camera2DFollowSystem(),
	new ScreenFadeSystem(),
	new CameraTransitionSystem(),
	new CameraShakeSystem(),
];

/**
 * Ambient presentation systems: the shared ambient clock, the per-frame weather
 * publication consumers read, lightning and its two subscribers, the particle
 * sim, and the weather ambience. Present in the bundled game and in the editor's
 * edit mode, so weather and VFX are live while authoring.
 *
 * The three lightning systems are ordered and adjacent on purpose: the world
 * event bus is cleared at the end of a frame, so a strike's flash and its
 * thunder must be stepped in the same frame as the scheduler that published it.
 *
 * Everything in this list is derivation, and every world that gets it steps it
 * exactly once — `game` spreads it after {@link gameplaySystems} so it sits past
 * the camera, and `editorEdit` spreads it after {@link editWorldSystems}. Nothing
 * here may create an entity carrying a `@serializable` component or write a
 * `@serialize`d field: the editor's save path diffs a journal replay against the
 * live edit world serialized whole and hard-crashes on drift. Ambient state
 * belongs in a non-serialized store keyed by the ECS or owned by a system
 * instance. The weather *scheduler* is the one system that owns serialized state,
 * which is why it lives in {@link gameplaySystems} instead.
 *
 * VFX takes its update system as an argument because that system shares a store
 * instance with a render system, so the pair is built by the caller (see
 * {@link createVfxSystems}) and its halves land in two different lists.
 */
const ambientSystems = (vfx: VfxUpdateSystem): UpdateSystem[] => [
	new AmbientClockSystem(),
	new WeatherPresentationSystem(),
	new LightningSystem(),
	new LightningFlashSystem(),
	new ThunderSystem(),
	vfx,
	new WeatherAudioSystem(),
];

/**
 * The ordered render list. Shared by the bundled game and the editor edit
 * world (both draw the level while authoring or playing).
 *
 * The sky is first: within a layer, submission order is draw order, and it
 * shares `background` with the surface decorations.
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
		new SkyRenderSystem(),
		new DecorationsRenderSystem(surfaceDecorations),
		new DecorationsRenderSystem(tileDecorations),
		new DebugTagSystem("overlay"),
		new InteractOutlineRenderSystem("entities"),
		new SpriteRenderSystem(),
		new BowRenderSystem(),
		new TilemapRenderSystem(),
		new LightningRenderSystem(),
		new LightningFlashRenderSystem(),
	];
};

/**
 * The bundled game: edit-world maintenance, the full gameplay list, the ambient
 * list, and the render list, all added to one world.
 *
 * {@link BloodVfxSystem} sits between the gameplay and ambient lists and takes
 * the same store the VFX pair shares. It reads combat events, so it must follow
 * everything that emits them and precede the VFX step that advances the spurt it
 * fired. It is game-only: the edit world has no combat, and the engine's VFX
 * factory cannot know about a game effect.
 */
export const game: Composition = ({
	settings,
	gravityY,
}): CompositionSystems => {
	const vfx = createVfxSystems();
	return {
		update: [
			...editWorldSystems(gravityY),
			...gameplaySystems(settings),
			new BloodVfxSystem(vfx.store),
			...ambientSystems(vfx.update),
		],
		render: [...renderSystems(), vfx.render],
	};
};

/**
 * Dead code, kept only because {@link GameModule.compositions} still declares the
 * field. Nothing calls it.
 *
 * The editor's run world is not built from here: `RunHost` asks the game module
 * for a runtime, and `platformer-runtime.registerSystems` gives that fresh world
 * the {@link game} composition, while `RunHost.mountUi` adds the HUD separately.
 * Do not add systems here expecting them to run in the editor — they will not.
 */
export const editorRun: Composition = ({
	settings,
	hud,
}): CompositionSystems => ({
	update: [...gameplaySystems(settings), ...(hud?.update ?? [])],
	render: [...(hud?.render ?? [])],
});

/**
 * The editor edit world: render systems, tile-collision and nav-graph
 * maintenance, and the ambient list. No gameplay, no physics — the authored world
 * is drawn, kept consistent, and shows live weather while editing, never
 * simulated.
 */
export const editorEdit: Composition = ({
	gravityY,
}): CompositionSystems => {
	const vfx = createVfxSystems();
	return {
		update: [
			...editWorldSystems(gravityY),
			...ambientSystems(vfx.update),
		],
		render: [...renderSystems(), vfx.render],
	};
};
