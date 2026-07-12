import { Game } from "../../engine/game";
import type { Runtime } from "../../engine/runtime/runtime";
import { SaveDriver } from "../../engine/save/save-driver";
import type { SaveMetadata } from "../../engine/save/save-driver";
import { FsSaveStore } from "../../engine/save/fs-save-store";
import { SaveManager } from "../../engine/save/save-manager";
import { Scene, SceneConfig } from "../../engine/scene/scene";
import type Viewport from "../../engine/camera/viewport";
import {
	createFreshRuntime,
	startNewRuntime,
} from "./platformer-runtime";

const AUTOSAVE_INTERVAL_MS = 60_000;

export class GameShell {
	private readonly game: Game;
	private readonly manager = new SaveManager();
	private readonly store = new FsSaveStore();

	private driver: SaveDriver;
	private scene: Scene | null = null;
	private started = false;

	constructor() {
		this.game = new Game({
			onFrame: ({ delta }) => {
				if (!this.game.paused) {
					void this.driver.tick(delta);
				}
			},
		});
		this.driver = this.makeDriver(createFreshRuntime());
	}

	get viewport(): Viewport {
		return this.game.viewport;
	}

	canSave(): boolean {
		return this.driver.canSave();
	}

	newGame(): void {
		this.beginWith(startNewRuntime());
	}

	async continueLatest(): Promise<boolean> {
		const ok = await this.driver.continueLatest();
		if (ok) {
			this.resume();
		}
		return ok;
	}

	async load(slot: string): Promise<boolean> {
		const ok = await this.driver.load(slot);
		if (ok) {
			this.resume();
		}
		return ok;
	}

	async quickSave(): Promise<boolean> {
		return this.driver.quickSave();
	}

	async quickLoad(): Promise<boolean> {
		return this.driver.quickLoad();
	}

	async manualSave(name: string): Promise<string> {
		return this.driver.manualSave(name);
	}

	async listSaves(): Promise<ReadonlyArray<SaveMetadata>> {
		return this.driver.listSaves();
	}

	async deleteSave(slot: string): Promise<void> {
		await this.driver.deleteSave(slot);
	}

	async goToScene(id: string): Promise<void> {
		this.driver.runtime.goToScene(id);
		this.mount(this.driver.runtime);
		await this.driver.onSceneTransition();
	}

	setPaused(paused: boolean): void {
		this.game.setPaused(paused);
	}

	quitToMenu(): void {
		const menu = createFreshRuntime();
		const previous = this.driver.runtime;
		this.driver = this.makeDriver(menu);
		this.mount(menu);
		previous.dispose();
		this.game.setPaused(true);
	}

	private beginWith(runtime: Runtime): void {
		const previous = this.driver.runtime;
		this.driver = this.makeDriver(runtime);
		this.mount(runtime);
		previous.dispose();
		this.resume();
	}

	private resume(): void {
		if (!this.started) {
			this.started = true;
			this.game.start();
		}
		this.game.setPaused(false);
	}

	private makeDriver(runtime: Runtime): SaveDriver {
		return new SaveDriver({
			runtime,
			manager: this.manager,
			store: this.store,
			createRuntime: createFreshRuntime,
			now: () => Date.now(),
			autosaveIntervalMs: AUTOSAVE_INTERVAL_MS,
			onRuntimeChanged: (next) => this.mount(next),
		});
	}

	private mount(runtime: Runtime): void {
		const previous = this.scene;
		this.scene = new Scene({
			kind: "game",
			name: runtime.activeScene ?? "game",
			config: runtime.config ?? new SceneConfig(),
			world: runtime.world,
			gameplaySystems: [],
		});
		this.game.sceneManager.setBase(this.scene);
		if (previous) {
			this.game.renderer.releaseSceneTarget(previous);
		}
	}
}
