import { startCameraTransition } from "../camera/camera-transition-system";
import type { CameraTransitionConfig } from "../camera/camera-transition-component";
import { Camera2DComponent } from "../camera/camera-2d-component";
import { TransformComponent } from "../transform-component";
import type { Seconds } from "../duration";
import type { EffectHandle } from "../effect-handle";
import { startFade } from "../fade/screen-fade-system";
import type { CutsceneContext, CutsceneWait } from "./cutscene";

type EventClass<T> = abstract new (...args: any[]) => T;

export const wait = (seconds: Seconds): CutsceneWait => {
	let elapsed = 0;
	return {
		done: (ctx) => {
			elapsed += ctx.time.dt;
			return elapsed >= seconds;
		},
		complete: () => {
			elapsed = seconds;
		},
	};
};

export const waitFor = <T>(event: EventClass<T>): CutsceneWait => ({
	done: (ctx) => ctx.events.read(event).length > 0,
	complete: () => {},
});

export const effect = (handle: EffectHandle): CutsceneWait => ({
	done: () => handle.done(),
	complete: () => handle.complete(),
});

export const fade = (
	ctx: CutsceneContext,
	to: number,
	duration: Seconds,
	easing?: string,
): CutsceneWait => effect(startFade(ctx.ecs, to, duration, easing));

export const fadeOut = (
	ctx: CutsceneContext,
	duration = 0.35 as Seconds,
): CutsceneWait => fade(ctx, 1, duration);

export const fadeIn = (
	ctx: CutsceneContext,
	duration = 0.45 as Seconds,
): CutsceneWait => fade(ctx, 0, duration);

export const cameraTo = (
	ctx: CutsceneContext,
	config: Omit<CameraTransitionConfig, "mode"> &
		Readonly<{ mode?: CameraTransitionConfig["mode"] }>,
): CutsceneWait => {
	const mode = config.mode ?? autoMode(ctx, config.target);
	return effect(startCameraTransition(ctx.ecs, { ...config, mode }));
};

export type LazyWait = CutsceneWait | (() => CutsceneWait);

const materialize = (item: LazyWait): CutsceneWait =>
	typeof item === "function" ? item() : item;

export const sequence = (
	...items: ReadonlyArray<LazyWait>
): CutsceneWait => {
	let index = 0;
	let current: CutsceneWait | null = null;
	return {
		done: (ctx) => {
			while (index < items.length) {
				current ??= materialize(items[index]!);
				if (!current.done(ctx)) {
					return false;
				}
				current = null;
				index += 1;
			}
			return true;
		},
		complete: (ctx) => {
			for (; index < items.length; index += 1) {
				(current ?? materialize(items[index]!)).complete(ctx);
				current = null;
			}
		},
	};
};

export const parallel = (
	...waits: ReadonlyArray<CutsceneWait>
): CutsceneWait => {
	let remaining = [...waits];
	return {
		done: (ctx) => {
			remaining = remaining.filter((w) => !w.done(ctx));
			return remaining.length === 0;
		},
		complete: (ctx) => {
			for (const w of remaining) {
				w.complete(ctx);
			}
			remaining = [];
		},
	};
};

const autoMode = (
	ctx: CutsceneContext,
	target: CameraTransitionConfig["target"],
): CameraTransitionConfig["mode"] => {
	const entry = ctx.ecs.query(Camera2DComponent)[0];
	if (!entry) {
		return "cut";
	}
	const camera = entry[1].camera;
	const destination =
		typeof target === "string"
			? ctx.ecs.getComponent(target, TransformComponent)?.position
			: target;
	if (!destination) {
		return "cut";
	}
	const bounds = camera.visibleBounds();
	const width = bounds.max.x - bounds.min.x;
	const height = bounds.max.y - bounds.min.y;
	const dx = Math.abs(destination.x - camera.position.x);
	const dy = Math.abs(destination.y - camera.position.y);
	return dx <= width && dy <= height ? "glide" : "cut";
};
