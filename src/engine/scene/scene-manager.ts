import type { Time } from "../clock";
import type { Milliseconds } from "../duration";
import { NULL_ACTIONS } from "../input/bindings/action-provider";
import type { DeviceSnapshot } from "../input/device-snapshot";
import type { Input } from "../input/input";
import type Renderer2D from "../render/renderer-2d";
import type { GlobalServices } from "../services";
import type { UpdateContext } from "../system";
import { renderSceneToTexture } from "../camera/camera-2d-render";
import type { Scene } from "./scene";

export type SceneFlags = Readonly<{
	update: boolean;
	render: boolean;
	blocksUpdateBelow: boolean;
	blocksInputBelow: boolean;
}>;

export type ActiveScene = SceneFlags & Readonly<{ scene: Scene }>;

export type FrameUpdate = Readonly<{ dt: Milliseconds; time: Time }>;
export type FrameRender = Readonly<{ time: Time }>;

const BASE_FLAGS: SceneFlags = {
	update: true,
	render: true,
	blocksUpdateBelow: false,
	blocksInputBelow: false,
};

export class SceneManager {
	private readonly services: GlobalServices;
	private stack: ActiveScene[] = [];
	private lastSource: DeviceSnapshot | null = null;

	constructor(services: GlobalServices) {
		this.services = services;
	}

	get base(): Scene | null {
		return this.stack[0]?.scene ?? null;
	}

	get top(): Scene | null {
		return this.stack[this.stack.length - 1]?.scene ?? null;
	}

	get active(): ReadonlyArray<ActiveScene> {
		return this.stack;
	}

	setBase(scene: Scene): void {
		const entry: ActiveScene = { scene, ...BASE_FLAGS };
		if (this.stack.length === 0) {
			this.stack.push(entry);
		} else {
			this.stack[0] = entry;
		}
	}

	push(scene: Scene, flags: Partial<SceneFlags> = {}): void {
		this.stack.push({ scene, ...BASE_FLAGS, ...flags });
	}

	pop(): void {
		if (this.stack.length > 1) {
			this.stack.pop();
		}
	}

	receivesInput(scene: Scene): boolean {
		for (let i = this.stack.length - 1; i >= 0; i--) {
			const entry = this.stack[i]!;
			if (entry.scene === scene) {
				return true;
			}
			if (entry.blocksInputBelow) {
				return false;
			}
		}
		return false;
	}

	update(
		frame: FrameUpdate,
		input: DeviceSnapshot = this.services.input,
		source: DeviceSnapshot = input,
	): void {
		const inputChanged = source !== this.lastSource;
		this.lastSource = source;
		const updatable: Scene[] = [];
		for (let i = this.stack.length - 1; i >= 0; i--) {
			const entry = this.stack[i]!;
			if (entry.update) {
				updatable.push(entry.scene);
			}
			if (entry.blocksUpdateBelow) {
				break;
			}
		}
		updatable.reverse();
		for (const scene of updatable) {
			const ctx = this.updateContext(
				scene,
				frame,
				input,
				inputChanged,
			);
			scene.world.ecs.update(ctx);
			scene.updateGameplay(ctx);
			scene.world.ecs.flushDestroyed();
		}
	}

	render(
		renderer: Renderer2D,
		frame: FrameRender,
		input: Input = this.services.input,
	): void {
		const renderable = this.stack
			.filter((entry) => entry.render)
			.map((entry) => entry.scene);

		const targets = renderable.map((scene) => {
			renderer.beginFrame();
			scene.world.ecs.render({
				renderer,
				time: frame.time,
				ecs: scene.world.ecs,
				input,
				assetManager: this.services.assetManager,
				uiScale: scene.config.uiScale ?? 1,
			});
			const target = renderer.sceneTarget(scene);
			renderSceneToTexture(renderer, scene, target);
			return target;
		});

		renderer.composite(targets, {
			x: 0,
			y: 0,
			w: renderer.width,
			h: renderer.height,
		});
	}

	clearEvents(): void {
		for (const entry of this.stack) {
			entry.scene.world.events.clear();
		}
	}

	private updateContext(
		scene: Scene,
		frame: FrameUpdate,
		input: DeviceSnapshot,
		inputChanged: boolean,
	): UpdateContext {
		const actions = scene.actions ?? NULL_ACTIONS;
		if (inputChanged) {
			actions.resetEdges();
		}
		actions.step(input, frame.dt);
		return {
			dt: frame.dt,
			time: frame.time,
			ecs: scene.world.ecs,
			world: scene.world,
			input,
			actions,
			assetManager: this.services.assetManager,
			audio: this.services.audio,
			events: scene.world.events,
		};
	}
}
