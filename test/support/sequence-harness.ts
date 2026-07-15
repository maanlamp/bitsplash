import type AudioManager from "../../src/engine/audio/audio";
import { pickActiveCamera2D } from "../../src/engine/camera/camera-2d-render";
import { Clock } from "../../src/engine/clock";
import type {
	Milliseconds,
	Seconds,
} from "../../src/engine/duration";
import type { ActionProvider } from "../../src/engine/input/bindings/action-provider";
import type { DeviceSnapshot } from "../../src/engine/input/device-snapshot";
import type { CollisionMatrix } from "../../src/engine/physics/collision";
import { loadRapier } from "../../src/engine/physics/rapier-physics";
import type {
	Runtime,
	SceneDefinition,
} from "../../src/engine/runtime/runtime";
import { Runtime as RuntimeClass } from "../../src/engine/runtime/runtime";
import { SaveManager } from "../../src/engine/save/save-manager";
import type { UpdateContext } from "../../src/engine/system";
import { World } from "../../src/engine/world";

const FRAME_MS = (1000 / 60) as Milliseconds;

type RapierModule = typeof import("@dimforge/rapier2d");

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as unknown as RapierModule;
	});

export type HarnessConfig = Readonly<{
	initialScene: string;
	seed: (world: World) => void;
	resolveScene: (id: string) => SceneDefinition;
	registerSystems?: (world: World) => void;
	now?: () => number;
	/** Collision matrix for the world, matching the shipped game's layers. */
	collisionMatrix?: CollisionMatrix;
	/** Device snapshot fed to systems each frame (defaults to a throwing stub). */
	input?: DeviceSnapshot;
	/** Action provider fed to systems each frame (defaults to a throwing stub). */
	actions?: ActionProvider;
	/** Audio manager fed to systems each frame (defaults to a throwing stub). */
	audio?: AudioManager;
}>;

const stubService = <T>(label: string): T =>
	new Proxy(
		{},
		{
			get: () => {
				throw new Error(
					`sequence-harness: the "${label}" service is a stub; a system under test reached for it. Extend the harness to provide a real one.`,
				);
			},
		},
	) as T;

export class SequenceFixture {
	private runtimeValue: Runtime;
	private readonly clock = new Clock();
	private frame = 0;

	private constructor(
		runtime: Runtime,
		private readonly config: HarnessConfig,
		private readonly manager: SaveManager,
		private readonly now: () => number,
	) {
		this.runtimeValue = runtime;
	}

	static makeRuntime(config: HarnessConfig): Runtime {
		const initial = config.resolveScene(config.initialScene);
		const world = new World(
			initial.config.gravity,
			config.collisionMatrix,
		);
		config.registerSystems?.(world);
		return new RuntimeClass({
			world,
			seed: config.seed,
			resolveScene: config.resolveScene,
		});
	}

	static async create(
		config: HarnessConfig,
	): Promise<SequenceFixture> {
		await loadRapierHeadless();
		const runtime = SequenceFixture.makeRuntime(config);
		runtime.newGame(config.initialScene);
		const now = config.now ?? (() => Date.now());
		return new SequenceFixture(
			runtime,
			config,
			new SaveManager(),
			now,
		);
	}

	get runtime(): Runtime {
		return this.runtimeValue;
	}

	get world(): World {
		return this.runtimeValue.world;
	}

	get ecs() {
		return this.runtimeValue.world.ecs;
	}

	private buildContext(): UpdateContext {
		this.clock.advance(FRAME_MS);
		const time = this.clock.snapshot(FRAME_MS);
		return {
			dt: FRAME_MS,
			time,
			ecs: this.world.ecs,
			world: this.world,
			input: this.config.input ?? stubService("input"),
			actions: this.config.actions ?? stubService("actions"),
			assetManager: stubService("assetManager"),
			events: this.world.events,
			audio: this.config.audio ?? stubService("audio"),
			camera: pickActiveCamera2D(this.world.ecs),
		};
	}

	step(frames = 1): void {
		for (let i = 0; i < frames; i++) {
			const ctx = this.buildContext();
			this.world.ecs.update(ctx);
			this.world.step((FRAME_MS / 1000) as Seconds);
			this.world.ecs.flushDestroyed();
			this.world.events.clear();
			this.frame += 1;
		}
	}

	async saveAndReload(): Promise<SequenceFixture> {
		const blob = await this.manager.capture(
			this.runtimeValue,
			this.now(),
		);
		const fresh = SequenceFixture.makeRuntime(this.config);
		await this.manager.restore(fresh, blob);
		this.runtimeValue.dispose();
		this.runtimeValue = fresh;
		return this;
	}

	dispose(): void {
		this.runtimeValue.dispose();
	}
}
