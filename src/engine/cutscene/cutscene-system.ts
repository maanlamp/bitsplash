import type { ECS, ReadonlyECS } from "../ecs";
import { type UpdateContext, UpdateSystem } from "../system";
import type { CutsceneDef } from "./cutscene";
import { CutsceneComponent } from "./cutscene-component";

export type CutsceneBindings = Readonly<{
	skipHeld(ctx: UpdateContext): boolean;
}>;

const SKIP_HOLD_SECONDS = 0.6;

export const startCutscene = (ecs: ECS, def: CutsceneDef): void => {
	if (ecs.query(CutsceneComponent)[0]) {
		return;
	}
	ecs.createEntity([new CutsceneComponent(def)]);
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
		if (!cutscene.context) {
			cutscene.context = {
				ecs: ctx.ecs,
				world: ctx.world,
				events: ctx.events,
				assetManager: ctx.assetManager,
				audio: ctx.audio,
			};
		}

		cutscene.skipHeldTime = this.bindings.skipHeld(ctx)
			? cutscene.skipHeldTime + ctx.time.dt
			: 0;
		const skip = cutscene.skipHeldTime >= SKIP_HOLD_SECONDS;
		if (skip) {
			cutscene.skipHeldTime = 0;
		}

		if (skip) {
			this.skipScene(ctx, cutscene);
		} else {
			this.advance(ctx, cutscene);
		}

		if (cutscene.sceneIndex >= cutscene.def.scenes.length) {
			ctx.ecs.destroyEntity(id);
		}
	}

	private ensureIterator(cutscene: CutsceneComponent): void {
		if (!cutscene.iterator) {
			const scene = cutscene.def.scenes[cutscene.sceneIndex];
			if (scene && cutscene.context) {
				cutscene.iterator = scene(cutscene.context);
			}
		}
	}

	private advance(
		ctx: UpdateContext,
		cutscene: CutsceneComponent,
	): void {
		while (cutscene.sceneIndex < cutscene.def.scenes.length) {
			this.ensureIterator(cutscene);
			if (!cutscene.iterator) {
				return;
			}
			if (cutscene.wait) {
				if (!cutscene.wait.done(ctx)) {
					return;
				}
				cutscene.wait = null;
			}
			const result = cutscene.iterator.next();
			if (result.done) {
				cutscene.iterator = null;
				cutscene.sceneIndex += 1;
			} else {
				cutscene.wait = result.value;
			}
		}
	}

	private skipScene(
		ctx: UpdateContext,
		cutscene: CutsceneComponent,
	): void {
		this.ensureIterator(cutscene);
		if (!cutscene.iterator) {
			return;
		}
		if (cutscene.wait) {
			cutscene.wait.complete(ctx);
			cutscene.wait = null;
		}
		while (true) {
			const result = cutscene.iterator.next();
			if (result.done) {
				break;
			}
			result.value.complete(ctx);
		}
		cutscene.iterator = null;
		cutscene.sceneIndex += 1;
	}
}
