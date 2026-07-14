import { Camera2DComponent } from "../camera/camera-2d-component";
import type { CameraTransitionConfig } from "../camera/camera-transition-component";
import { startCameraTransition } from "../camera/camera-transition-system";
import type { Framing } from "../camera/framing";
import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import type { EffectHandle } from "../effect-handle";
import { startFade } from "../fade/screen-fade-system";
import { TILE_SIZE } from "../tilemap/tile";
import { TransformComponent } from "../transform-component";
import Vector2 from "../vector2";
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
	yield api.step(
		id,
		(ctx, tick) => {
			if (ctx.skip && (verb.skippable?.(ctx) ?? true)) {
				return verb.complete ? verb.complete(ctx) : true;
			}
			return verb.poll(ctx, tick);
		},
		(ctx) => verb.skippable?.(ctx) ?? true,
	);
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
	let issued = false;
	const issueAndSnap = (ctx: CutsceneContext): void => {
		handle = start(ctx);
		handle.complete();
		issued = true;
	};
	return {
		setup: () =>
			api.effect((ctx) => {
				handle = start(ctx);
				issued = true;
			}),
		poll: (ctx) => {
			if (issued) {
				return handle === null || handle.done();
			}
			issueAndSnap(ctx);
			return true;
		},
		complete: (ctx) => {
			if (!issued) {
				issueAndSnap(ctx);
				return true;
			}
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

const framingTarget = (
	api: CutsceneApi,
	target: EntityId | Vector2,
	framing: Framing,
): EntityId | Vector2 => {
	if (!framing.offsetTiles || typeof target !== "string") {
		return target;
	}
	const offset = framing.offsetTiles;
	const base = api.read((ctx) => {
		const transform = ctx.ecs.getComponent(
			target,
			TransformComponent,
		);
		return transform ? transform.position.clone() : null;
	});
	if (!base) {
		return target;
	}
	return base.add(
		new Vector2(offset.x * TILE_SIZE, offset.y * TILE_SIZE),
	);
};

export const focusOn = (
	api: CutsceneApi,
	target: EntityId | Vector2,
	framing: Framing,
): CutsceneVerb =>
	cameraTo(api, {
		target: framingTarget(api, target, framing),
		zoom: framing.zoom,
		mode: framing.mode,
		duration: framing.duration,
		followAfter:
			framing.follow && typeof target === "string"
				? [target]
				: undefined,
	});

export const beat = (seconds: Seconds): CutsceneVerb => wait(seconds);

export const parallel = (
	api: CutsceneApi,
	...makes: ReadonlyArray<(a: CutsceneApi) => CutsceneVerb>
): CutsceneVerb => {
	const verbs = makes.map((make, i) => make(scope(api, String(i))));
	const finished = verbs.map(() => false);
	let seeded = false;
	const ensureSeeded = (): void => {
		if (seeded) {
			return;
		}
		verbs.forEach((_, i) => {
			finished[i] = api.recall(`done:${i}`) === true;
		});
		seeded = true;
	};
	const settle = (i: number): void => {
		finished[i] = true;
		api.remember(`done:${i}`, true);
	};
	return {
		setup: () => {
			ensureSeeded();
			verbs.forEach((verb, i) => {
				if (!finished[i]) {
					verb.setup?.();
				}
			});
		},
		poll: (ctx, tick) => {
			ensureSeeded();
			let all = true;
			verbs.forEach((verb, i) => {
				if (!finished[i] && verb.poll(ctx, tick)) {
					settle(i);
				}
				if (!finished[i]) {
					all = false;
				}
			});
			return all;
		},
		complete: (ctx) => {
			ensureSeeded();
			let all = true;
			verbs.forEach((verb, i) => {
				if (!finished[i] && (verb.complete?.(ctx) ?? true)) {
					settle(i);
				}
				if (!finished[i]) {
					all = false;
				}
			});
			return all;
		},
		skippable: (ctx) =>
			verbs.every(
				(verb, i) => finished[i] || (verb.skippable?.(ctx) ?? true),
			),
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
