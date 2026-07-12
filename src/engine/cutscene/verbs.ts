import { Camera2DComponent } from "../camera/camera-2d-component";
import type { CameraTransitionConfig } from "../camera/camera-transition-component";
import { startCameraTransition } from "../camera/camera-transition-system";
import type { Seconds } from "../duration";
import type { EffectHandle } from "../effect-handle";
import { startFade } from "../fade/screen-fade-system";
import { TransformComponent } from "../transform-component";
import type {
	CutsceneApi,
	CutsceneContext,
	CutsceneStep,
	CutsceneVerb,
} from "./cutscene";

type EventClass<T> = abstract new (...args: any[]) => T;

export const scope = (
	api: CutsceneApi,
	prefix: string,
): CutsceneApi => ({
	step: api.step,
	effect: api.effect,
	read: api.read,
	spawn: (refId, create) => api.spawn(`${prefix}/${refId}`, create),
	ref: (refId) => api.ref(`${prefix}/${refId}`),
	remember: (key, value) => api.remember(`${prefix}/${key}`, value),
	recall: (key) => api.recall(`${prefix}/${key}`),
});

export const step = function* (
	api: CutsceneApi,
	id: string,
	make: (api: CutsceneApi) => CutsceneVerb,
): Generator<CutsceneStep, void, void> {
	const verb = make(scope(api, id));
	verb.setup?.();
	yield api.step(id, (ctx, tick) => {
		if (ctx.skip) {
			return verb.complete ? verb.complete(ctx) : true;
		}
		return verb.poll(ctx, tick);
	});
};

export const wait = (seconds: Seconds): CutsceneVerb => ({
	poll: (_ctx, tick) => tick.elapsed >= seconds,
	complete: () => true,
});

export const waitFor = <T>(event: EventClass<T>): CutsceneVerb => ({
	poll: (ctx) => ctx.events.read(event).length > 0,
	complete: () => true,
});

const runEffect = (
	api: CutsceneApi,
	start: (ctx: CutsceneContext) => EffectHandle,
): CutsceneVerb => {
	let handle: EffectHandle | null = null;
	return {
		setup: () =>
			api.effect((ctx) => {
				handle = start(ctx);
			}),
		poll: () => handle === null || handle.done(),
		complete: () => {
			handle?.complete();
			return true;
		},
	};
};

export const fade = (
	api: CutsceneApi,
	to: number,
	duration: Seconds,
	easing?: string,
): CutsceneVerb =>
	runEffect(api, (ctx) => startFade(ctx.ecs, to, duration, easing));

export const fadeOut = (
	api: CutsceneApi,
	duration = 0.35 as Seconds,
): CutsceneVerb => fade(api, 1, duration);

export const fadeIn = (
	api: CutsceneApi,
	duration = 0.45 as Seconds,
): CutsceneVerb => fade(api, 0, duration);

export const cameraTo = (
	api: CutsceneApi,
	config: Omit<CameraTransitionConfig, "mode"> &
		Readonly<{ mode?: CameraTransitionConfig["mode"] }>,
): CutsceneVerb =>
	runEffect(api, (ctx) => {
		const mode = config.mode ?? autoMode(ctx, config.target);
		return startCameraTransition(ctx.ecs, { ...config, mode });
	});

export const sequence = (
	...verbs: ReadonlyArray<CutsceneVerb>
): CutsceneVerb => {
	let index = 0;
	let started = false;
	const start = (): void => {
		if (!started) {
			verbs[index]?.setup?.();
			started = true;
		}
	};
	return {
		poll: (ctx, tick) => {
			while (index < verbs.length) {
				start();
				if (!verbs[index]!.poll(ctx, tick)) {
					return false;
				}
				index += 1;
				started = false;
			}
			return true;
		},
		complete: (ctx) => {
			while (index < verbs.length) {
				start();
				if (!(verbs[index]!.complete?.(ctx) ?? true)) {
					return false;
				}
				index += 1;
				started = false;
			}
			return true;
		},
	};
};

export const parallel = (
	...verbs: ReadonlyArray<CutsceneVerb>
): CutsceneVerb => {
	const finished = verbs.map(() => false);
	return {
		setup: () => {
			for (const verb of verbs) {
				verb.setup?.();
			}
		},
		poll: (ctx, tick) => {
			let all = true;
			verbs.forEach((verb, i) => {
				if (!finished[i]) {
					finished[i] = verb.poll(ctx, tick);
				}
				if (!finished[i]) {
					all = false;
				}
			});
			return all;
		},
		complete: (ctx) => {
			let all = true;
			verbs.forEach((verb, i) => {
				if (!finished[i]) {
					finished[i] = verb.complete?.(ctx) ?? true;
				}
				if (!finished[i]) {
					all = false;
				}
			});
			return all;
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
