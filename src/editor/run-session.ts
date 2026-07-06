import type { Time } from "../engine/clock";
import type { Milliseconds } from "../engine/duration";
import type { EntityId } from "../engine/ecs";
import { Input } from "../engine/input/input";
import { deserializeWorld } from "../engine/serialization/deserialize";
import type { SerializedWorld } from "../engine/serialization/registry";
import { serializeWorld } from "../engine/serialization/serialize";
import { World } from "../engine/world";
import type { SceneView } from "./scene-view";

export type RunInputMode = "game" | "editor";

const FIXED_DT_MS = (1000 / 60) as Milliseconds;

export class RunSession {
	private mode: RunInputMode = "game";
	private readonly muted = new Input(document.createElement("div"));
	private readonly journalStart: number;
	private readonly snapshotIds: ReadonlySet<string>;
	private stopped = false;
	private lastTime: Time | null = null;

	constructor(
		readonly view: SceneView,
		private readonly onChange: () => void,
	) {
		this.journalStart = view.history.mark();
		view.scene.setSimulating(true);
		this.snapshotIds = new Set(
			(view.scene.snapshotData ?? []).map((entity) => entity.id),
		);
		this.applyMode();
	}

	get inputMode(): RunInputMode {
		return this.mode;
	}

	isRuntimeEntity(id: EntityId): boolean {
		return (
			!this.snapshotIds.has(id) &&
			!this.view.history.createdIds.has(id)
		);
	}

	async serializeAuthored(): Promise<SerializedWorld> {
		const snapshot = this.view.scene.snapshotData;
		if (!snapshot) {
			return serializeWorld(this.view.scene.world.ecs);
		}
		const authored = new World(this.view.scene.config.gravity);
		deserializeWorld(authored, snapshot);
		await this.view.history.replayInto(authored, this.journalStart);
		const serialized = serializeWorld(authored.ecs);
		authored.clear();
		return serialized;
	}

	get paused(): boolean {
		return this.view.scene.isPaused;
	}

	setMode(mode: RunInputMode): void {
		if (this.mode === mode) {
			return;
		}
		this.mode = mode;
		this.applyMode();
		this.onChange();
	}

	toggleMode(): void {
		this.setMode(this.mode === "game" ? "editor" : "game");
	}

	setPaused(paused: boolean): void {
		this.view.scene.setPaused(paused);
		this.onChange();
	}

	togglePause(): void {
		this.setPaused(!this.paused);
	}

	step(): void {
		if (!this.paused || this.lastTime === null) {
			return;
		}
		this.view.stepGameplayOnce(
			FIXED_DT_MS,
			this.lastTime,
			this.muted,
		);
		this.onChange();
	}

	frame(dt: Milliseconds, time: Time): void {
		this.lastTime = time;
		this.view.rollInput();
		this.muted.update();
		const real = this.view.input;
		const editorInput = this.mode === "editor" ? real : this.muted;
		const gameInput = this.mode === "game" ? real : this.muted;
		this.view.runUpdate(dt, time, editorInput, gameInput);
		this.view.render(time);
		this.view.scene.world.events.clear();
	}

	async stop(): Promise<void> {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.view.captureCameraView();
		this.view.scene.setSimulating(false);
		await this.view.history.replayFrom(this.journalStart);
		this.view.restoreCameraView();
		this.view.setCameraActive(true);
		this.muted.dispose();
		this.onChange();
	}

	private applyMode(): void {
		this.view.setCameraActive(this.mode === "editor");
	}
}
