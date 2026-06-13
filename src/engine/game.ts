import AssetManager from "./assets";
import AudioManager from "./audio/audio";
import { Clock } from "./clock";
import type { ECS } from "./ecs";
import EventBus from "./events";
import { Input } from "./input/input";
import Renderer2D from "./renderer-2d";
import { renderActiveCamera } from "./systems/camera-2d";
import Viewport from "./viewport";
import { World } from "./world";

export type FrameInfo = Readonly<{ delta: number; fps: number }>;

export type GameOptions = Readonly<{
	gravity: Readonly<{ x: number; y: number }>;
	uiScale?: number;
	onFrame?: (info: FrameInfo) => void;
}>;

export class Game {
	readonly viewport = new Viewport();
	readonly renderer: Renderer2D;
	readonly input: Input;
	readonly world: World;
	readonly assetManager = new AssetManager();
	readonly events = new EventBus();
	readonly audio: AudioManager;
	private clock = new Clock();

	uiScale: number;

	private isPaused = false;
	private onFrame?: (info: FrameInfo) => void;
	private rafId: number | null = null;
	private running = false;
	private lastFps = 0;
	private lastFrameTime = 0;

	constructor(options: GameOptions) {
		this.renderer = new Renderer2D(this.viewport);
		this.input = new Input(this.viewport.element);
		this.world = new World(options.gravity);
		this.audio = new AudioManager(this.viewport.element);
		this.uiScale = options.uiScale ?? 1;
		this.onFrame = options.onFrame;
	}

	get ecs(): ECS {
		return this.world.ecs;
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
			const delta = time - lastTime;
			const fps = delta > 0 ? 1000 / delta : 0;
			this.lastFps = fps;

			this.clock.advance(delta);
			const now = this.clock.snapshot(delta);

			this.input.update();
			if (!this.isPaused) {
				this.ecs.update({
					dt: delta,
					time: now,
					ecs: this.ecs,
					world: this.world,
					input: this.input,
					assetManager: this.assetManager,
					events: this.events,
					audio: this.audio,
				});
			}
			this.renderer.beginFrame();
			this.ecs.render({
				renderer: this.renderer,
				time: now,
				ecs: this.ecs,
				input: this.input,
				assetManager: this.assetManager,
			});
			this.onFrame?.({ delta, fps });
			renderActiveCamera(this.renderer, this.ecs, this.uiScale);
			this.renderer.endFrame();
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
