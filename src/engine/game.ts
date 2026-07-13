import AssetManager from "./assets";
import AudioManager from "./audio/audio";
import { pickActiveCamera2D } from "./camera/camera-2d-render";
import { Clock } from "./clock";
import type { Milliseconds } from "./duration";
import EventBus from "./events";
import type { DeviceSnapshot } from "./input/device-snapshot";
import { Input } from "./input/input";
import { LocalStorageSettingsStore } from "./input/local-storage-settings-store";
import type { SettingsStore } from "./input/settings-store";
import Renderer2D from "./render/renderer-2d";
import type { ReactNode } from "react";
import { UiRuntime, type UiRuntimeOptions } from "./ui/ui-runtime";
import type { Scene } from "./scene/scene";
import { SceneManager } from "./scene/scene-manager";
import type { GlobalServices } from "./services";
import Viewport from "./camera/viewport";

const MAX_FRAME_MS = 100 as Milliseconds;

export type FrameInfo = Readonly<{ delta: number; fps: number }>;

export type GameOptions = Readonly<{
	onFrame?: (info: FrameInfo) => void;
	settings?: SettingsStore;
}>;

export class Game {
	readonly viewport = new Viewport();
	readonly renderer: Renderer2D;
	readonly input: Input;
	readonly assetManager = new AssetManager();
	readonly events = new EventBus();
	readonly audio: AudioManager;
	readonly services: GlobalServices;
	readonly sceneManager: SceneManager;

	private clock = new Clock();
	private ui: UiRuntime | null = null;
	private isPaused = false;
	private onFrame?: (info: FrameInfo) => void;
	private rafId: number | null = null;
	private running = false;
	private lastFps = 0;
	private lastFrameTime = 0;

	constructor(options: GameOptions) {
		this.renderer = new Renderer2D(this.viewport);
		this.input = new Input(this.viewport.element);
		this.audio = new AudioManager();
		this.onFrame = options.onFrame;
		this.services = {
			input: this.input,
			assetManager: this.assetManager,
			audio: this.audio,
			clock: this.clock,
			events: this.events,
			settings: options.settings ?? new LocalStorageSettingsStore(),
		};
		this.sceneManager = new SceneManager(this.services);
	}

	get scene(): Scene | null {
		return this.sceneManager.base;
	}

	get paused(): boolean {
		return this.isPaused;
	}

	get frameTime(): number {
		return this.lastFrameTime;
	}

	get fps(): number {
		return this.lastFps;
	}

	setPaused(paused: boolean): void {
		this.isPaused = paused;
	}

	get uiRuntime(): UiRuntime | null {
		return this.ui;
	}

	mountUI(element: ReactNode, options: UiRuntimeOptions): UiRuntime {
		const ui = new UiRuntime(options);
		this.ui = ui;
		ui.mount(element);
		return ui;
	}

	start(): () => void {
		this.viewport.element.focus();
		this.running = true;
		let lastTime = 0;

		const tick = (time = lastTime) => {
			if (!this.running) {
				return;
			}

			const before = performance.now();
			const rawDelta = (time - lastTime) as Milliseconds;
			const delta = Math.min(rawDelta, MAX_FRAME_MS) as Milliseconds;
			const fps = rawDelta > 0 ? 1000 / rawDelta : 0;
			this.lastFps = fps;

			this.clock.advance(delta);
			const now = this.clock.snapshot(delta);

			this.input.update();
			const runGameplay = (masked: DeviceSnapshot): void => {
				if (!this.isPaused) {
					this.sceneManager.update(
						{ dt: delta, time: now },
						masked,
						this.input,
					);
				}
			};
			if (this.ui) {
				const uiScale = this.sceneManager.base?.config.uiScale ?? 1;
				this.ui.step(this.input, uiScale, delta / 1000, runGameplay);
				const base = this.sceneManager.base;
				const camera = base
					? pickActiveCamera2D(base.world.ecs)
					: null;
				this.ui.layout(
					uiScale,
					this.renderer.width,
					this.renderer.height,
					camera ?? undefined,
				);
			} else {
				runGameplay(this.input);
			}
			this.sceneManager.render(this.renderer, { time: now });
			this.onFrame?.({ delta: rawDelta, fps });
			this.renderer.endFrame();
			this.ui?.clearEvents();
			this.sceneManager.clearEvents();
			this.events.clear();

			this.lastFrameTime = performance.now() - before;
			lastTime = time;
			this.rafId = requestAnimationFrame(tick);
		};

		tick();

		return () => {
			this.stop();
		};
	}

	stop(): void {
		this.running = false;
		this.input.dispose();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
}
