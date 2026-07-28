import type { ECS, EntityId, ReadonlyECS } from "../ecs";
import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	resolveCast,
	sequenceSkippable,
	skipSequence,
	tickSequence,
} from "./interpreter";
import type { OpContext } from "./op-registry";
import type { SequenceDef } from "./sequence-def";
import { SequenceComponent } from "./sequence-component";
import { SequenceRunState } from "./sequence-run-state";

export const SKIP_HOLD_SECONDS = 0.6;

export type SequenceBindings = Readonly<{
	skipHeld(ctx: UpdateContext): boolean;
}>;

const defs = new Map<string, SequenceDef>();

export const registerSequenceDef = (def: SequenceDef): void => {
	defs.set(def.id, def);
};

export const hasSequenceDef = (id: string): boolean => defs.has(id);

export const sequenceDefById = (id: string): SequenceDef => {
	const def = defs.get(id);
	if (!def) {
		throw new Error(
			`sequence def "${id}" is not registered (rule 8: unknown id crashes loudly)`,
		);
	}
	return def;
};

export type SequenceStartParams = Readonly<
	Record<string, string | number>
>;

const createSequence = (
	ecs: ECS,
	def: SequenceDef,
	params?: SequenceStartParams,
): void => {
	const component = new SequenceComponent(def);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			component.run.blackboard[key] = value;
		}
	}
	ecs.createEntity([component]);
};

export const startSequence = (
	ecs: ECS,
	def: SequenceDef,
	params?: SequenceStartParams,
): void => {
	if (def.class === "ambient") {
		createSequence(ecs, def, params);
		return;
	}
	const entry = exclusiveEntry(ecs);
	if (!entry) {
		createSequence(ecs, def, params);
		return;
	}
	const component = entry[1];
	if (
		component.defId === def.id ||
		component.queue.some((id) => id === def.id)
	) {
		return;
	}
	component.queue.push(def.id);
};

const exclusiveEntry = (
	ecs: ReadonlyECS,
): readonly [EntityId, SequenceComponent] | undefined =>
	ecs.find(
		SequenceComponent,
		(component) => component.sequenceClass === "exclusive",
	);

export const currentExclusiveSequence = (
	ecs: ReadonlyECS,
): SequenceComponent | undefined => exclusiveEntry(ecs)?.[1];

export const isExclusiveSequenceRunning = (
	ecs: ReadonlyECS,
): boolean => exclusiveEntry(ecs) !== undefined;

export const isExclusiveSequenceActive = (
	ecs: ReadonlyECS,
): boolean => {
	const entry = exclusiveEntry(ecs);
	return entry !== undefined && !entry[1].run.controlReleased;
};

export const isAnySequenceActive = (ecs: ReadonlyECS): boolean =>
	ecs.query(SequenceComponent).length > 0;

@profiler("Sequence", "Sequence")
export class SequenceSystem extends UpdateSystem {
	constructor(private readonly bindings: SequenceBindings) {
		super();
	}

	update(ctx: UpdateContext): void {
		for (const [id, component] of ctx.ecs.query(SequenceComponent)) {
			this.tickComponent(ctx, id, component);
		}
	}

	private tickComponent(
		ctx: UpdateContext,
		id: EntityId,
		component: SequenceComponent,
	): void {
		const def = sequenceDefById(component.defId);
		const opCtx = this.buildContext(ctx, id, component);

		resolveCast(def, opCtx);

		const exclusive = component.sequenceClass === "exclusive";
		const skip = exclusive && this.pollSkip(ctx, component);

		const done = skip
			? skipSequence(def, opCtx)
			: tickSequence(def, opCtx);

		component.currentSkippable = exclusive
			? sequenceSkippable(def, opCtx)
			: false;

		if (done) {
			this.finish(ctx, id, component);
		}
	}

	private buildContext(
		ctx: UpdateContext,
		id: EntityId,
		component: SequenceComponent,
	): OpContext {
		return {
			ecs: ctx.ecs,
			world: ctx.world,
			events: ctx.events,
			assetManager: ctx.assetManager,
			audio: ctx.audio,
			dt: ctx.time.dt,
			entityId: id,
			sequenceClass: component.sequenceClass,
			run: component.run,
		};
	}

	/**
	 * Whether the hold-to-skip gesture has just completed.
	 *
	 * Held time is zeroed both when the gesture fires and whenever the sequence
	 * reports itself unskippable, so it banks nothing across a halt: the player
	 * re-earns the full {@link SKIP_HOLD_SECONDS} after every choice, `waitUntil`
	 * or unskippable step, and nothing is ever skipped by inertia.
	 */
	private pollSkip(
		ctx: UpdateContext,
		component: SequenceComponent,
	): boolean {
		if (!component.currentSkippable) {
			component.skipHeldTime = 0;
			return false;
		}
		component.skipHeldTime = this.bindings.skipHeld(ctx)
			? component.skipHeldTime + ctx.time.dt
			: 0;
		if (component.skipHeldTime >= SKIP_HOLD_SECONDS) {
			component.skipHeldTime = 0;
			return true;
		}
		return false;
	}

	private finish(
		ctx: UpdateContext,
		id: EntityId,
		component: SequenceComponent,
	): void {
		if (component.sequenceClass !== "exclusive") {
			ctx.ecs.destroy(id);
			return;
		}
		const next = component.queue.shift();
		if (next === undefined) {
			ctx.ecs.destroy(id);
			return;
		}
		const nextDef = sequenceDefById(next);
		if (nextDef.class !== "exclusive") {
			throw new Error(
				`sequence "${next}" is queued behind "${component.defId}" but is ${nextDef.class}; only exclusive defs may be queued, because reuse hands this entity — and everything else attached to it — to the queued sequence`,
			);
		}
		component.defId = next;
		component.sequenceClass = nextDef.class;
		component.run = new SequenceRunState();
		component.currentSkippable = true;
		component.skipHeldTime = 0;
	}
}
