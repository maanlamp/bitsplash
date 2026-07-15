import { createElement } from "react";
import { Game } from "../../engine/game";
import type { ECS } from "../../engine/ecs";
import { LastUsedDevice } from "../../engine/input/last-used-device";
import { resolveFont } from "../../engine/text/resolve-font";
import type { Runtime } from "../../engine/runtime/runtime";
import { SaveDriver } from "../../engine/save/save-driver";
import { FsSaveStore } from "../../engine/save/fs-save-store";
import { SaveManager } from "../../engine/save/save-manager";
import { Scene, SceneConfig } from "../../engine/scene/scene";
import { createPlatformerActions } from "../input/platformer-actions";
import { UI_FONT } from "../dialogue/dialogue-ui";
import { DialogueHudState } from "../dialogue/dialogue-hud-state";
import { HealthBarHudState } from "../health/health-bar-hud-state";
import { InteractHintHudState } from "../interaction/interact-hint-hud-state";
import { QuestMarkerHudState } from "../quest/quest-marker-hud-state";
import type { GameUiActions } from "../ui/game-ui-actions";
import { GameUiState } from "../ui/game-ui-state";
import { GameUI } from "../ui/game-ui";
import { createHudSystems } from "../ui/hud-systems";
import { HudState } from "../ui/hud-state";
import { SkipHintState } from "../ui/skip-hint-state";
import {
	createFreshRuntime,
	startNewRuntime,
} from "./platformer-runtime";

const AUTOSAVE_INTERVAL_MS = 60_000;

const TOAST_STEPS: ReadonlyArray<Readonly<[number, number | null]>> =
	[
		[1000, 0.8],
		[1150, 0.55],
		[1300, 0.3],
		[1450, 0.1],
		[1550, null],
	];

export class GameShell {
	private readonly game: Game;
	private readonly manager = new SaveManager();
	private readonly store = new FsSaveStore();
	private readonly uiState = new GameUiState();
	private readonly hudState = new HudState();
	private readonly dialogueHud = new DialogueHudState();
	private readonly healthBars = new HealthBarHudState();
	private readonly interactHint = new InteractHintHudState();
	private readonly questMarkers = new QuestMarkerHudState();
	private readonly skipHint = new SkipHintState();
	private readonly lastUsedDevice = new LastUsedDevice();

	private driver: SaveDriver;
	private scene: Scene | null = null;
	private started = false;
	private paintEcs: ECS | null = null;
	private toastSeq = 0;

	constructor() {
		this.game = new Game({
			onFrame: ({ delta }) => {
				if (!this.game.paused) {
					void this.driver.tick(delta);
				}
			},
		});
		this.driver = this.makeDriver(createFreshRuntime());
		this.game.mountUI(
			createElement(GameUI, {
				state: this.uiState,
				actions: this.actions,
				hud: this.hudState,
				dialogue: this.dialogueHud,
				healthBars: this.healthBars,
				interactHint: this.interactHint,
				questMarkers: this.questMarkers,
				skipHint: this.skipHint,
			}),
			{
				resolveFont: (font) =>
					resolveFont(font ?? UI_FONT, this.game.assetManager),
				font: (ctx) => resolveFont(UI_FONT, ctx.assetManager),
			},
		);
	}

	attach(node: HTMLElement): () => void {
		return this.game.viewport.attach(node);
	}

	start(): void {
		if (this.started) {
			return;
		}
		this.started = true;
		this.mount(this.driver.runtime);
		this.game.setPaused(true);
		this.uiState.setPhase("menu");
		this.uiState.setView("root");
		void this.refreshSaves();
		window.addEventListener("keydown", this.onKeyDown, {
			capture: true,
		});
		this.game.start();
	}

	private readonly actions: GameUiActions = {
		newGame: () => this.beginPlaying(startNewRuntime()),
		continueLatest: () => void this.continueLatest(),
		openLoad: () => void this.openLoad(),
		closeLoad: () => this.uiState.setView("root"),
		loadSlot: (slot) => void this.loadSlot(slot),
		deleteSlot: (slot) => void this.deleteSlot(slot),
		resume: () => this.closePause(),
		saveGame: () => void this.saveGame(),
		quit: () => this.quitToMenu(),
	};

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		const snap = this.uiState.getSnapshot();
		if (snap.phase !== "playing") {
			return;
		}
		if (event.code === "Escape") {
			event.preventDefault();
			if (snap.paused) {
				this.closePause();
			} else {
				this.openPause();
			}
		} else if (event.code === "F5") {
			event.preventDefault();
			void this.quickSave();
		} else if (event.code === "F9") {
			event.preventDefault();
			void this.quickLoad();
		}
	};

	private openPause(): void {
		this.uiState.setView("root");
		this.uiState.setPaused(true);
		this.game.setPaused(true);
		void this.refreshSaves();
	}

	private closePause(): void {
		this.uiState.setPaused(false);
		this.uiState.setView("root");
		this.game.setPaused(false);
		this.game.viewport.element.focus();
	}

	private beginPlaying(runtime: Runtime): void {
		const previous = this.driver.runtime;
		this.driver = this.makeDriver(runtime);
		this.mount(runtime);
		previous.dispose();
		if (!this.started) {
			this.started = true;
			this.game.start();
		}
		this.uiState.setPaused(false);
		this.uiState.setView("root");
		this.uiState.setPhase("playing");
		this.game.setPaused(false);
	}

	private async continueLatest(): Promise<void> {
		this.uiState.setBusy(true);
		const ok = await this.driver.continueLatest();
		this.uiState.setBusy(false);
		if (ok) {
			this.enterPlaying();
		}
	}

	private async loadSlot(slot: string): Promise<void> {
		this.uiState.setBusy(true);
		const ok = await this.driver.load(slot);
		this.uiState.setBusy(false);
		if (ok) {
			this.enterPlaying();
		}
	}

	private enterPlaying(): void {
		this.uiState.setPaused(false);
		this.uiState.setView("root");
		this.uiState.setPhase("playing");
		this.game.setPaused(false);
	}

	private async deleteSlot(slot: string): Promise<void> {
		await this.driver.deleteSave(slot);
		await this.refreshSaves();
	}

	private async openLoad(): Promise<void> {
		await this.refreshSaves();
		this.uiState.setView("load");
	}

	private async saveGame(): Promise<void> {
		this.uiState.setBusy(true);
		const saves = await this.driver.listSaves();
		const count = saves.filter((s) => s.kind === "manual").length;
		await this.driver.manualSave(`Save ${count + 1}`);
		await this.refreshSaves();
		this.uiState.setBusy(false);
	}

	private async quickSave(): Promise<void> {
		const ok = await this.driver.quickSave();
		this.showToast(ok ? "Quicksaved" : "Save unavailable");
	}

	private async quickLoad(): Promise<void> {
		const ok = await this.driver.quickLoad();
		this.showToast(ok ? "Quickloaded" : "No quicksave");
	}

	private quitToMenu(): void {
		const menu = createFreshRuntime();
		const previous = this.driver.runtime;
		this.driver = this.makeDriver(menu);
		this.mount(menu);
		previous.dispose();
		this.uiState.setPaused(false);
		this.uiState.setView("root");
		this.uiState.setPhase("menu");
		this.game.setPaused(true);
		void this.refreshSaves();
	}

	private async refreshSaves(): Promise<void> {
		this.uiState.setSaves(await this.driver.listSaves());
	}

	private showToast(text: string): void {
		const seq = ++this.toastSeq;
		this.uiState.setToast({ text, alpha: 1 });
		for (const [delay, alpha] of TOAST_STEPS) {
			setTimeout(() => {
				if (this.toastSeq !== seq) {
					return;
				}
				this.uiState.setToast(
					alpha === null ? null : { text, alpha },
				);
			}, delay);
		}
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
			actions: createPlatformerActions(this.game.services.settings),
			gameplaySystems: [],
		});
		this.game.sceneManager.setBase(this.scene);
		if (previous) {
			this.game.renderer.releaseSceneTarget(previous);
		}

		const ecs = runtime.world.ecs;
		if (this.paintEcs !== ecs) {
			const ui = this.game.uiRuntime;
			if (ui) {
				const { update, render } = createHudSystems(
					ui,
					{
						hud: this.hudState,
						dialogue: this.dialogueHud,
						healthBars: this.healthBars,
						interactHint: this.interactHint,
						questMarkers: this.questMarkers,
						skipHint: this.skipHint,
					},
					this.lastUsedDevice,
				);
				for (const system of update) {
					ecs.addUpdateSystem(system);
				}
				for (const system of render) {
					ecs.addRenderSystem(system);
				}
			}
			this.paintEcs = ecs;
		}
	}
}
