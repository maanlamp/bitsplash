import { Camera2DComponent } from "../camera/camera-2d-component";
import { Camera2DFollowComponent } from "../camera/camera-2d-follow-component";
import { borrowCameraFollow } from "../camera/camera-2d-follow-system";
import {
	type CameraTransitionConfig,
	CameraTransitionComponent,
	type CameraTransitionMode,
	type CameraTransitionTarget,
} from "../camera/camera-transition-component";
import { startCameraTransition } from "../camera/camera-transition-system";
import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { startFade } from "../fade/screen-fade-system";
import { ScreenFadeComponent } from "../fade/screen-fade-component";
import { TILE_SIZE } from "../tilemap/tile";
import { TransformComponent } from "../transform-component";
import Vector2 from "../vector2";
import { resolveActor } from "./interpreter";
import type { OpContext, OpExecutor } from "./op-registry";
import { registerOpType, registerPredicate } from "./op-registry";
import type { ActorRef, OpParams, Vec2 } from "./op";
import { OP_TYPES, PREDICATE_IDS } from "./builder";

const asSeconds = (
	value: number | undefined,
	fallback: number,
): Seconds => (value ?? fallback) as Seconds;

const fadeExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		if (memory.issued === true) {
			return;
		}
		startFade(
			ctx.ecs,
			params.to as number,
			asSeconds(params.duration as number, 0),
			(params.easing as string) ?? "linear",
		);
		memory.issued = true;
	},
	poll(ctx) {
		const entry = ctx.ecs.query(ScreenFadeComponent)[0];
		return !entry || entry[1].tween === null;
	},
	skip(ctx, params, memory) {
		startFade(ctx.ecs, params.to as number, 0 as Seconds).complete();
		memory.issued = true;
	},
};

/**
 * Assert the sequence may drive the camera and record the gameplay follow state
 * as borrowed by this sequence, so the camera is handed back when the sequence
 * is gone however it ends. Every camera op goes through here, which is what
 * keeps camera control sequence-scoped by construction.
 */
const takeCamera = (ctx: OpContext, op: string): void => {
	if (ctx.sequenceClass !== "exclusive") {
		throw new Error(
			`sequence op "${op}" is exclusive-only; an ambient sequence may not drive the camera`,
		);
	}
	borrowCameraFollow(ctx.ecs, ctx.entityId);
};

const resolveCameraTarget = (
	ctx: OpContext,
	target: Vec2 | ActorRef,
): CameraTransitionTarget => {
	if (typeof target === "string") {
		const entity = resolveActor(ctx.run, target);
		if (!entity) {
			throw new Error(
				`camera op could not resolve actor "${target}"`,
			);
		}
		return entity;
	}
	return new Vector2(target.x, target.y);
};

const cameraConfig = (
	ctx: OpContext,
	target: Vec2 | ActorRef,
	zoom: number,
	mode: string | undefined,
	duration: number | undefined,
	follow: boolean | undefined,
): CameraTransitionConfig => {
	const resolved = resolveCameraTarget(ctx, target);
	const followAfter: EntityId[] =
		follow === true && typeof resolved === "string" ? [resolved] : [];
	return {
		target: resolved,
		zoom,
		mode: (mode as CameraTransitionMode) ?? "glide",
		duration: asSeconds(duration, 0.6),
		followAfter,
	};
};

const cameraTransitionActive = (ctx: OpContext): boolean =>
	ctx.ecs.query(Camera2DComponent, CameraTransitionComponent).length >
	0;

const cameraToExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		takeCamera(ctx, OP_TYPES.cameraTo);
		if (memory.issued === true) {
			return;
		}
		startCameraTransition(
			ctx.ecs,
			cameraConfig(
				ctx,
				params.target as Vec2 | ActorRef,
				params.zoom as number,
				params.mode as string | undefined,
				params.duration as number | undefined,
				params.follow as boolean | undefined,
			),
		);
		memory.issued = true;
	},
	poll(ctx) {
		return !cameraTransitionActive(ctx);
	},
	skip(ctx, params, memory) {
		takeCamera(ctx, OP_TYPES.cameraTo);
		startCameraTransition(
			ctx.ecs,
			cameraConfig(
				ctx,
				params.target as Vec2 | ActorRef,
				params.zoom as number,
				params.mode as string | undefined,
				params.duration as number | undefined,
				params.follow as boolean | undefined,
			),
		).complete();
		memory.issued = true;
	},
};

type Framing = Readonly<{
	zoom: number;
	mode?: string;
	duration?: number;
	follow?: boolean;
	offsetTiles?: Vec2;
}>;

const focusTarget = (
	ctx: OpContext,
	target: Vec2 | ActorRef,
	framing: Framing,
): Vec2 | ActorRef => {
	if (!framing.offsetTiles || typeof target !== "string") {
		return target;
	}
	const entity = resolveActor(ctx.run, target);
	const transform = entity
		? ctx.ecs.getComponent(entity, TransformComponent)
		: undefined;
	if (!transform) {
		return target;
	}
	return {
		x: transform.position.x + framing.offsetTiles.x * TILE_SIZE,
		y: transform.position.y + framing.offsetTiles.y * TILE_SIZE,
	};
};

const focusConfig = (
	ctx: OpContext,
	params: OpParams,
): CameraTransitionConfig => {
	const framing = params.framing as Framing;
	const target = focusTarget(
		ctx,
		params.target as Vec2 | ActorRef,
		framing,
	);
	return cameraConfig(
		ctx,
		target,
		framing.zoom,
		framing.mode,
		framing.duration,
		framing.follow,
	);
};

const focusOnExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		takeCamera(ctx, OP_TYPES.focusOn);
		if (memory.issued === true) {
			return;
		}
		startCameraTransition(ctx.ecs, focusConfig(ctx, params));
		memory.issued = true;
	},
	poll(ctx) {
		return !cameraTransitionActive(ctx);
	},
	skip(ctx, params, memory) {
		takeCamera(ctx, OP_TYPES.focusOn);
		startCameraTransition(
			ctx.ecs,
			focusConfig(ctx, params),
		).complete();
		memory.issued = true;
	},
};

const applyFollow = (ctx: OpContext, params: OpParams): void => {
	const entry = ctx.ecs.query(Camera2DFollowComponent)[0];
	if (!entry) {
		return;
	}
	const targets: EntityId[] = [];
	for (const ref of params.actors as readonly ActorRef[]) {
		const entity = resolveActor(ctx.run, ref);
		if (entity) {
			targets.push(entity);
		}
	}
	entry[1].targets = targets;
};

const followExecutor: OpExecutor = {
	arm(ctx, params) {
		takeCamera(ctx, OP_TYPES.follow);
		applyFollow(ctx, params);
	},
	poll() {
		return true;
	},
	skip(ctx, params) {
		takeCamera(ctx, OP_TYPES.follow);
		applyFollow(ctx, params);
	},
};

const controlExecutor = (released: boolean): OpExecutor => ({
	arm(ctx) {
		ctx.run.controlReleased = released;
	},
	poll() {
		return true;
	},
	skip(ctx) {
		ctx.run.controlReleased = released;
	},
	skippable() {
		return true;
	},
});

const blackboardEqualsPredicate = (
	ctx: OpContext,
	params: OpParams,
): boolean =>
	ctx.run.blackboard[params.key as string] ===
	(params.value as string | number);

const reachedPredicate = (
	ctx: OpContext,
	params: OpParams,
): boolean => {
	const entity = resolveActor(ctx.run, params.actor as ActorRef);
	if (!entity) {
		return false;
	}
	const transform = ctx.ecs.getComponent(entity, TransformComponent);
	if (!transform) {
		return false;
	}
	const tolerance = (params.tolerance as number | undefined) ?? 1;
	return (
		Math.abs(transform.position.x - (params.x as number)) <= tolerance
	);
};

let registered = false;

export const registerEngineSequenceOps = (): void => {
	if (registered) {
		return;
	}
	registered = true;
	registerOpType(OP_TYPES.fade, fadeExecutor);
	registerOpType(OP_TYPES.cameraTo, cameraToExecutor);
	registerOpType(OP_TYPES.focusOn, focusOnExecutor);
	registerOpType(OP_TYPES.follow, followExecutor);
	registerOpType(OP_TYPES.releaseControl, controlExecutor(true));
	registerOpType(OP_TYPES.lockControl, controlExecutor(false));
	registerPredicate(
		PREDICATE_IDS.blackboardEquals,
		blackboardEqualsPredicate,
	);
	registerPredicate(PREDICATE_IDS.reached, reachedPredicate);
};
