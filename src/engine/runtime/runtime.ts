import type { EntityId } from "../ecs";
import { PersistentComponent } from "../scene/persistent-component";
import type { SceneConfig } from "../scene/scene";
import { deserializeWorld } from "../serialization/deserialize";
import type { SerializedWorld } from "../serialization/registry";
import { serializeWorld } from "../serialization/serialize";
import type { World } from "../world";

export type SceneEnterReason = "fresh" | "revisit" | "restore";

export type SceneDefinition = Readonly<{
	config: SceneConfig;
	build: (world: World) => void;
	onEnter?: (world: World, reason: SceneEnterReason) => void;
	onExit?: (world: World) => void;
}>;

export type RuntimeOptions = Readonly<{
	world: World;
	seed: (world: World) => void;
	resolveScene: (id: string) => SceneDefinition;
}>;

export type RuntimeState = Readonly<{
	activeSceneId: string;
	persistent: SerializedWorld;
	scenes: Record<string, SerializedWorld>;
}>;

export class Runtime {
	readonly world: World;

	private readonly seed: (world: World) => void;
	private readonly resolveScene: (id: string) => SceneDefinition;
	private readonly frozen = new Map<string, SerializedWorld>();

	private activeSceneId: string | null = null;
	private activeDefinition: SceneDefinition | null = null;
	private seeded = false;

	constructor(options: RuntimeOptions) {
		this.world = options.world;
		this.seed = options.seed;
		this.resolveScene = options.resolveScene;
	}

	get activeScene(): string | null {
		return this.activeSceneId;
	}

	get config(): SceneConfig | null {
		return this.activeDefinition?.config ?? null;
	}

	frozenScene(id: string): SerializedWorld | undefined {
		return this.frozen.get(id);
	}

	newGame(sceneId: string): void {
		if (this.seeded) {
			throw new Error(
				"Runtime.newGame: the persistent set is already seeded; dispose and rebuild the Runtime to start a new game.",
			);
		}
		this.seed(this.world);
		this.seeded = true;
		this.goToScene(sceneId, "fresh");
	}

	goToScene(id: string, reason?: SceneEnterReason): void {
		const target = this.resolveScene(id);
		if (this.activeSceneId !== null) {
			this.activeDefinition?.onExit?.(this.world);
			this.freezeSceneContent(this.activeSceneId);
			this.despawnSceneContent();
		}
		const snapshot = this.frozen.get(id);
		const effectiveReason: SceneEnterReason =
			reason ?? (snapshot ? "revisit" : "fresh");
		if (snapshot) {
			deserializeWorld(this.world, snapshot, `frozen scene "${id}"`);
		} else {
			target.build(this.world);
		}
		this.world.setGravity(target.config.gravity);
		this.activeSceneId = id;
		this.activeDefinition = target;
		target.onEnter?.(this.world, effectiveReason);
	}

	snapshot(): RuntimeState {
		if (this.activeSceneId === null) {
			throw new Error(
				"Runtime.snapshot: no active scene; start a new game or restore before capturing.",
			);
		}
		const scenes: Record<string, SerializedWorld> = {};
		for (const [id, world] of this.frozen) {
			scenes[id] = world;
		}
		scenes[this.activeSceneId] = serializeWorld(
			this.world.ecs,
			(id) => this.isSceneContent(id),
		);
		return {
			activeSceneId: this.activeSceneId,
			persistent: serializeWorld(
				this.world.ecs,
				(id) => !this.isSceneContent(id),
			),
			scenes,
		};
	}

	restore(state: RuntimeState): void {
		if (this.activeSceneId !== null || this.seeded) {
			throw new Error(
				"Runtime.restore: restore into a fresh Runtime; dispose and rebuild before restoring.",
			);
		}
		deserializeWorld(
			this.world,
			state.persistent,
			"restored persistent",
		);
		this.seeded = true;
		for (const [id, world] of Object.entries(state.scenes)) {
			this.frozen.set(id, world);
		}
		this.goToScene(state.activeSceneId, "restore");
	}

	dispose(): void {
		this.world.dispose();
	}

	private isSceneContent(id: EntityId): boolean {
		return (
			this.world.ecs.getComponent(id, PersistentComponent) ===
			undefined
		);
	}

	private freezeSceneContent(sceneId: string): void {
		this.frozen.set(
			sceneId,
			serializeWorld(this.world.ecs, (id) => this.isSceneContent(id)),
		);
	}

	private despawnSceneContent(): void {
		for (const id of this.world.ecs.entities()) {
			if (this.isSceneContent(id)) {
				this.world.ecs.destroy(id);
			}
		}
		this.world.ecs.flushDestroyed();
	}
}
