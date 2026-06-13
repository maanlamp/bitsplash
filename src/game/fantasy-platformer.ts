import { Settings } from "planck";
import type AssetManager from "../engine/assets";
import type AudioManager from "../engine/audio/audio";
import {
	SurfaceDecorations,
	TileDecorations,
} from "../engine/decorations";
import type { ECS } from "../engine/ecs";
import { StateMachineSystem } from "../engine/fsm/state-machine-system";
import { Game } from "../engine/game";
import type { SerializedWorld } from "../engine/serialization/registry";
import { serializeWorld } from "../engine/serialization/serialize";
import type { UpdateSystem } from "../engine/system";
import { Camera2DFollowSystem } from "../engine/systems/camera-2d-follow";
import { CameraShakeSystem } from "../engine/systems/camera-shake";
import { DecorationsRenderSystem } from "../engine/systems/decorations-render";
import { PhysicsSystem } from "../engine/systems/physics";
import { PhysicsBodySystem } from "../engine/systems/physics-body";
import { SpriteRenderSystem } from "../engine/systems/sprite-render";
import { TilemapRenderSystem } from "../engine/systems/tilemap-render";
import { TimerSystem } from "../engine/systems/timer";
import { TILE_SIZE } from "../engine/tile";
import { TileCollisionBaker } from "../engine/tilemap/collision";
import { TileGrid } from "../engine/tilemap/grid";
import type Viewport from "../engine/viewport";
import type { World } from "../engine/world";
import tilesetUrl from "./assets/dirt.tileset.png";
import knickKnacksUrl from "./assets/knick-knacks-grass.png";
import tileDecorationsUrl from "./assets/tile-decorations.png";
import { GRAVITY } from "./constants";
import {
	loadDemoLevel,
	loadLevelEntities,
	spawnRuntimeEntities,
} from "./levels/demo";
import { UI_SCALE } from "./settings";
import { ArrowSystem } from "./systems/arrow";
import { BowSystem } from "./systems/bow";
import { DamageShakeSystem } from "./systems/damage-shake";
import { DamageTriggerSystem } from "./systems/damage-trigger";
import { DeathSystem } from "./systems/death";
import { DeathNoticeSystem } from "./systems/death-notice";
import { DeathOverlayRenderSystem } from "./systems/death-overlay-render";
import { DebugTagSystem } from "./systems/debug-tag";
import { DialogueSystem } from "./systems/dialogue";
import { DialogueRenderSystem } from "./systems/dialogue-render";
import { DialogueTriggerSystem } from "./systems/dialogue-trigger";
import { GroundDetectionSystem } from "./systems/ground-detection";
import { HealthSystem } from "./systems/health";
import { HealthBarSystem } from "./systems/health-bar";
import HealthRenderSystem from "./systems/health-render";
import { InteractHintRenderSystem } from "./systems/interact-hint-render";
import { InteractionSystem } from "./systems/interaction";
import { PatrolSystem } from "./systems/patrol";
import { PickupSystem } from "./systems/pickup";
import { PlayerInputSystem } from "./systems/player-input";
import { PlayerMovementStateSystem } from "./systems/player-movement-state";
import { SpawnSystem } from "./systems/spawn";
import { TileUnstuckSystem } from "./systems/tile-unstuck";
import { VoiceSystem } from "./systems/voice";

// This is insane
import.meta.glob("./fsm/*", { eager: true });

export const Layer = {
	DEBUG_GRID: 0,
	SURFACE_DECO_BACK: 10,
	PLAYER: 20,
	SURFACE_DECO_FRONT: 30,
	TILEMAP: 40,
	TILE_DECO: 45,
	DEBUG_TAG: 90,
	EDITOR_PREVIEW: 100,
} as const;

export default class FantasyPlatformer {
	readonly tileGrid: TileGrid;

	private engine: Game;
	private gameplaySystems: ReadonlyArray<UpdateSystem>;
	private simulating = false;
	private snapshot: SerializedWorld | null = null;

	constructor() {
		Settings.lengthUnitsPerMeter = TILE_SIZE;
		this.engine = new Game({ gravity: GRAVITY, uiScale: UI_SCALE });
		const { ecs, world } = this.engine;

		this.tileGrid = new TileGrid();
		new TileCollisionBaker(this.tileGrid, world);
		const surfaceDecorations = new SurfaceDecorations(
			this.tileGrid,
			knickKnacksUrl,
			Layer.SURFACE_DECO_BACK,
			Layer.SURFACE_DECO_FRONT,
		);
		const tileDecorations = new TileDecorations(
			this.tileGrid,
			tileDecorationsUrl,
			Layer.TILE_DECO,
		);

		this.gameplaySystems = [
			new PhysicsBodySystem(),
			new PlayerMovementStateSystem(),
			new PlayerInputSystem(),
			new StateMachineSystem(),
			new PatrolSystem(),
			new GroundDetectionSystem(),
			new PhysicsSystem(),
			new TileUnstuckSystem(this.tileGrid),
			new BowSystem(),
			new ArrowSystem(this.tileGrid),
			new PickupSystem(),
			new InteractionSystem(),
			new DialogueTriggerSystem(),
			new DialogueSystem(),
			new DamageTriggerSystem(),
			new HealthSystem(),
			new DamageShakeSystem(),
			new DeathSystem(),
			new TimerSystem(),
			new SpawnSystem(),
			new DeathNoticeSystem(),
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
			new TilemapRenderSystem(
				this.tileGrid,
				tilesetUrl,
				Layer.TILEMAP,
			),
		);
		ecs.addRenderSystem(new HealthRenderSystem(Layer.TILEMAP));
		ecs.addRenderSystem(new DeathOverlayRenderSystem());

		loadDemoLevel({ tileGrid: this.tileGrid, world });
	}

	get viewport(): Viewport {
		return this.engine.viewport;
	}

	get ecs(): ECS {
		return this.engine.ecs;
	}

	get world(): World {
		return this.engine.world;
	}

	get audio(): AudioManager {
		return this.engine.audio;
	}

	get assetManager(): AssetManager {
		return this.engine.assetManager;
	}

	get fps(): number {
		return this.engine.fps;
	}

	get frameTime(): number {
		return this.engine.frameTime;
	}

	setPaused(paused: boolean): void {
		this.engine.setPaused(paused);
	}

	setSimulating(enabled: boolean): void {
		if (enabled === this.simulating) {
			return;
		}
		this.simulating = enabled;
		if (enabled) {
			this.snapshot = serializeWorld(this.engine.ecs);
		}
		for (const system of this.gameplaySystems) {
			if (enabled) {
				this.engine.ecs.addUpdateSystem(system);
			} else {
				this.engine.ecs.removeUpdateSystem(system);
			}
		}
		if (enabled) {
			spawnRuntimeEntities({
				tileGrid: this.tileGrid,
				world: this.engine.world,
			});
		} else if (this.snapshot) {
			this.restore(this.snapshot);
			this.snapshot = null;
		}
	}

	private restore(entities: SerializedWorld): void {
		const { world } = this.engine;
		world.clear();
		loadLevelEntities({ tileGrid: this.tileGrid, world }, entities);
	}

	start(): () => void {
		return this.engine.start();
	}
}

if (import.meta.hot) {
	import.meta.hot.accept(() => {
		window.location.reload();
	});
}
