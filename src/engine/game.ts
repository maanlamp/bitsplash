import AssetManager from "./assets";
import AudioManager from "./audio/audio";
import { Clock } from "./clock";
import type { Milliseconds } from "./duration";
import EventBus from "./events";
import { Input } from "./input/input";
import Renderer2D from "./render/renderer-2d";
import type { Scene } from "./scene/scene";
import { SceneManager } from "./scene/scene-manager";
import type { GlobalServices } from "./services";
import Viewport from "./camera/viewport";

export type FrameInfo = Readonly<{ delta: number; fps: number }>;

export type GameOptions = Readonly<{
	onFrame?: (info: FrameInfo) => void;
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

	start(): () => void {
		this.viewport.element.focus();
		this.running = true;
		let lastTime = 0;

		const tick = (time = lastTime) => {
			if (!this.running) {
				return;
			}

			const before = performance.now();
			const delta = (time - lastTime) as Milliseconds;
			const fps = delta > 0 ? 1000 / delta : 0;
			this.lastFps = fps;

			this.clock.advance(delta);
			const now = this.clock.snapshot(delta);

			this.input.update();
			if (!this.isPaused) {
				this.sceneManager.update({ dt: delta, time: now });
			}
			this.sceneManager.render(this.renderer, { time: now });
			this.onFrame?.({ delta, fps });
			this.renderer.endFrame();
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
