import type { Seconds } from "../duration";
import type { ECS, EntityId, ReadonlyECS } from "../ecs";
import {
	ResumableSequence,
	type SequenceFactory,
} from "../sequence/resumable-sequence";
import { SequenceState } from "../sequence/sequence-state";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	type CutsceneContext,
	type CutsceneDef,
	MISSING_REQUIRED,
} from "./cutscene";
import { CutsceneComponent } from "./cutscene-component";

export type CutsceneBindings = Readonly<{
	skipHeld(ctx: UpdateContext): boolean;
}>;

export const SKIP_HOLD_SECONDS = 0.6;
const SKIP_GUARD = 10000;

const registry = new Map<string, CutsceneDef<any>>();

export const registerCutscene = (def: CutsceneDef<any>): void => {
	registry.set(def.id, def);
};

export const cutsceneDef = (
	id: string,
): CutsceneDef<any> | undefined => registry.get(id);

export const startCutscene = (
	ecs: ECS,
	def: CutsceneDef<any>,
): void => {
	registerCutscene(def);
	const entry = ecs.query(CutsceneComponent)[0];
	if (!entry) {
		ecs.createEntity([new CutsceneComponent(def)]);
		return;
	}
	const cutscene = entry[1];
	if (
		cutscene.defId === def.id ||
		cutscene.queue.some((queued) => queued === def.id)
	) {
		return;
	}
	cutscene.queue.push(def.id);
};

export const isCutsceneActive = (ecs: ReadonlyECS): boolean =>
	ecs.query(CutsceneComponent).length > 0;

export class CutsceneSystem implements UpdateSystem {
	private bindings: CutsceneBindings;

	constructor(bindings: CutsceneBindings) {
		this.bindings = bindings;
	}

	update(ctx: UpdateContext): void {
		const entry = ctx.ecs.query(CutsceneComponent)[0];
		if (!entry) {
			return;
		}
		const [id, cutscene] = entry;

		if (!this.resolveDef(cutscene)) {
			throw new Error(
				`cutscene "${cutscene.defId}" is not registered`,
			);
		}

		this.resolveCast(ctx, cutscene);

		const skip = this.pollSkip(ctx, cutscene);
		const context = this.buildContext(ctx, skip);

		if (cutscene.sceneIndex >= cutscene.def!.scenes.length) {
			this.finishScene(ctx, id, cutscene);
			return;
		}

		if (!cutscene.runner) {
			this.buildRunner(cutscene, context);
		}
		const runner = cutscene.runner!;

		this.drive(runner, context, ctx.time.dt, skip, cutscene);
		cutscene.currentSkippable = runner.currentSkippable(context);

		if (runner.status === "error") {
			throw (
				runner.error ??
				new Error(
					`cutscene "${cutscene.defId}" failed in scene ${cutscene.sceneIndex}`,
				)
			);
		}
		if (runner.done) {
			this.nextScene(ctx, id, cutscene);
		}
	}

	private resolveDef(cutscene: CutsceneComponent): boolean {
		if (!cutscene.def) {
			cutscene.def = cutsceneDef(cutscene.defId) ?? null;
		}
		return cutscene.def !== null;
	}

	private resolveCast(
		ctx: UpdateContext,
		cutscene: CutsceneComponent,
	): void {
		const resolver = cutscene.def!.cast;
		if (!resolver || Object.keys(cutscene.cast).length > 0) {
			return;
		}
		const resolved = resolver(ctx.ecs);
		if (resolved === MISSING_REQUIRED) {
			throw new Error(
				`cutscene "${cutscene.defId}" could not resolve a required cast member`,
			);
		}
		const pruned: Record<string, EntityId> = {};
		for (const [key, value] of Object.entries(
			resolved as Record<string, EntityId | undefined>,
		)) {
			if (value !== undefined) {
				pruned[key] = value;
			}
		}
		cutscene.cast = pruned;
	}

	private pollSkip(
		ctx: UpdateContext,
		cutscene: CutsceneComponent,
	): boolean {
		cutscene.skipHeldTime = this.bindings.skipHeld(ctx)
			? cutscene.skipHeldTime + ctx.time.dt
			: 0;
		if (cutscene.skipHeldTime >= SKIP_HOLD_SECONDS) {
			cutscene.skipHeldTime = 0;
			return true;
		}
		return false;
	}

	private buildContext(
		ctx: UpdateContext,
		skip: boolean,
	): CutsceneContext {
		return {
			ecs: ctx.ecs,
			world: ctx.world,
			events: ctx.events,
			assetManager: ctx.assetManager,
			audio: ctx.audio,
			skip,
		};
	}

	private buildRunner(
		cutscene: CutsceneComponent,
		context: CutsceneContext,
	): void {
		const scene = cutscene.def!.scenes[cutscene.sceneIndex]!;
		const cast = cutscene.cast;
		const factory: SequenceFactory<CutsceneContext> = (api) =>
			scene(api, cast);
		if (cutscene.sequence.stepId !== "") {
			const target = cutscene.sequence;
			const working = new SequenceState();
			const runner = new ResumableSequence(factory, working);
			runner.seek(target, context);
			cutscene.sequence = working;
			cutscene.runner = runner;
		} else {
			cutscene.runner = new ResumableSequence(
				factory,
				cutscene.sequence,
			);
		}
	}

	private drive(
		runner: ResumableSequence<CutsceneContext>,
		context: CutsceneContext,
		dt: Seconds,
		skip: boolean,
		cutscene: CutsceneComponent,
	): void {
		if (!skip) {
			runner.update(context, dt);
			return;
		}
		let guard = 0;
		while (runner.status === "running" && guard++ < SKIP_GUARD) {
			if (!runner.currentSkippable(context)) {
				runner.update(context, dt);
				return;
			}
			const before = cutscene.sequence.stepId;
			runner.update(context, dt);
			if (runner.status !== "running") {
				break;
			}
			if (cutscene.sequence.stepId === before) {
				break;
			}
		}
	}

	private nextScene(
		ctx: UpdateContext,
		id: EntityId,
		cutscene: CutsceneComponent,
	): void {
		cutscene.sceneIndex += 1;
		cutscene.runner = null;
		cutscene.sequence = new SequenceState();
		if (cutscene.sceneIndex >= cutscene.def!.scenes.length) {
			this.finishScene(ctx, id, cutscene);
		}
	}

	private finishScene(
		ctx: UpdateContext,
		id: EntityId,
		cutscene: CutsceneComponent,
	): void {
		const next = cutscene.queue.shift();
		if (next) {
			cutscene.defId = next;
			cutscene.def = cutsceneDef(next) ?? null;
			cutscene.sceneIndex = 0;
			cutscene.runner = null;
			cutscene.sequence = new SequenceState();
			cutscene.skipHeldTime = 0;
			cutscene.cast = {};
		} else {
			ctx.ecs.destroy(id);
		}
	}
}
