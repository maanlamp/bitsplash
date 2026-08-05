import AssetManager from "./assets";
import { applyVolumeSettings } from "./audio/apply-volume-settings";
import type { AudioApi } from "./audio/audio-api";
import type { AudioBus } from "./audio/audio-bus";
import { audioFocus, GAME_AUDIO_OWNER } from "./audio/audio-focus";
import { createAudio } from "./audio/create-audio";
import { pickActiveCamera2D } from "./camera/camera-2d-render";
import { renderWorld } from "./render/render-world";
import { Clock } from "./clock";
import type { Time } from "./clock";
import type { Milliseconds } from "./duration";
import EventBus from "./events";
import { Input } from "./input/input";
import { LocalStorageSettingsStore } from "./input/local-storage-settings-store";
import type { SettingsStore } from "./input/settings-store";
import Renderer2D from "./render/renderer-2d";
import type { ReactNode } from "react";
import { Host, type HostPlugin } from "./runtime/host";
import { UiRuntime, type UiRuntimeOptions } from "./ui/ui-runtime";
import type { Scene } from "./scene/scene";
import type { GlobalServices } from "./services";
import Viewport from "./camera/viewport";

export type FrameInfo = Readonly<{ delta: number; fps: number }>;

export type GameOptions = Readonly<{
	onFrame?: (info: FrameInfo) => void;
	settings?: SettingsStore;
	/** Composed onto this game's {@link Host} — save driving, scene mounting. */
	plugins?: ReadonlyArray<HostPlugin>;
}>;

/**
 * The bundled-game / preview host: owns the render surface, input, services, and
 * a single active {@link Scene} it updates and renders each frame. Scene
 * transitions swap the whole world behind {@link setScene}; there is no scene
 * stack or overlay (the editor's multi-view model lives in the editor layer).
 */
export class Game {
	readonly viewport = new Viewport();
	readonly renderer: Renderer2D;
	readonly input: Input;
	readonly assetManager = new AssetManager();
	readonly events = new EventBus();
	readonly audio: AudioApi;
	/**
	 * Everything this game plays hangs here. Window focus and pause gate it; the
	 * player's master volume is a level above, on the mixer's master bus.
	 */
	readonly audioBus: AudioBus;
	readonly services: GlobalServices;
	/** The frame this game advances; the game owns everything around it. */
	readonly host: Host;

	private clock = new Clock();
	private current: Scene | null = null;
	private ui: UiRuntime | null = null;
	private onFrame?: (info: FrameInfo) => void;
	private rafId: number | null = null;
	private running = false;
	private lastFps = 0;
	private lastFrameTime = 0;
	private readonly detachVolumes: () => void;
	private detachFocus: ReadonlyArray<() => void> = [];

	constructor(options: GameOptions) {
		this.renderer = new Renderer2D(this.viewport);
		this.input = new Input(this.viewport.element);
		this.audio = createAudio();
		this.audioBus = this.audio.createBus();
		this.detachVolumes = applyVolumeSettings(this.audio);
		this.onFrame = options.onFrame;
		this.services = {
			input: this.input,
			assetManager: this.assetManager,
			audio: this.audio,
			clock: this.clock,
			events: this.events,
			settings: options.settings ?? new LocalStorageSettingsStore(),
		};
		this.host = new Host({
			sceneSource: { current: () => this.current },
			inputSource: {
				sample: () => {
					this.input.update();
					return this.input;
				},
			},
			ui: {
				runtime: () => this.ui,
				width: () => this.renderer.width,
				height: () => this.renderer.height,
			},
			clock: this.clock,
			services: this.services,
			plugins: options.plugins,
		});
	}

	get scene(): Scene | null {
		return this.current;
	}

	/**
	 * Make `scene` the world this game updates and renders, and hang that world's
	 * audio under this game's bus so its sounds die with it.
	 */
	setScene(scene: Scene): void {
		const previous = this.current?.world;
		this.current = scene;
		if (scene.world !== previous) {
			scene.world.attachAudio(this.audio, this.audioBus);
		}
	}

	get gameplayPaused(): boolean {
		return this.host.gameplayPaused;
	}

	get frameTime(): number {
		return this.lastFrameTime;
	}

	get fps(): number {
		return this.lastFps;
	}

	/**
	 * The player's pause: the world stops simulating, the UI keeps stepping.
	 * Pausing also publishes a focus change, so the game's bus mutes — a paused
	 * game ticks no systems, and nothing pushing is no longer the same thing as
	 * nothing sounding.
	 */
	setGameplayPaused(paused: boolean): void {
		if (this.host.gameplayPaused === paused) {
			return;
		}
		this.host.setGameplayPaused(paused);
		audioFocus.setPaused(paused);
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
		const unregisterRealm = audioFocus.registerRealm(window);
		audioFocus.setRealmOwner(window, GAME_AUDIO_OWNER);
		audioFocus.setPaused(this.host.gameplayPaused);
		this.detachFocus = [
			unregisterRealm,
			audioFocus.gate(this.audioBus, GAME_AUDIO_OWNER),
		];
		let lastTime = 0;

		const tick = (time = lastTime) => {
			if (!this.running) {
				return;
			}

			const before = performance.now();
			const rawDelta = (time - lastTime) as Milliseconds;
			const fps = rawDelta > 0 ? 1000 / rawDelta : 0;
			this.lastFps = fps;

			const now = this.host.advance(rawDelta);
			this.host.step(rawDelta, now);
			this.renderScene(now);
			this.onFrame?.({ delta: rawDelta, fps });
			this.host.endFrame();
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
		this.host.stop();
		this.input.dispose();
		for (const detach of this.detachFocus) {
			detach();
		}
		this.detachFocus = [];
		this.detachVolumes();
		this.audioBus.dispose();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private renderScene(time: Time): void {
		const scene = this.current;
		if (!scene) {
			return;
		}
		this.renderer.frame((scope) => {
			renderWorld(scope, {
				world: scene.world,
				camera: pickActiveCamera2D(scene.world.ecs),
				time,
				input: this.input,
				assetManager: this.assetManager,
				uiScale: scene.config.uiScale ?? 1,
				presentation: { scene, targetKey: this },
			});
		});
	}
}
