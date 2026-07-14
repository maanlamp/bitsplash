import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import type { SerializableValue } from "../serialization/serializable-value";
import { SequenceState } from "./sequence-state";

export type SequenceTick = Readonly<{
	dt: Seconds;
	elapsed: Seconds;
}>;

export type Step<Ctx> = Readonly<{
	id: string;
	poll: (world: Ctx, tick: SequenceTick) => boolean;
	skippable?: (world: Ctx) => boolean;
}>;

export type SequenceApi<Ctx> = Readonly<{
	step(
		id: string,
		poll: (world: Ctx, tick: SequenceTick) => boolean,
		skippable?: (world: Ctx) => boolean,
	): Step<Ctx>;
	effect(fn: (world: Ctx) => void): void;
	read<T>(fn: (world: Ctx) => T): T;
	spawn(refId: string, create: (world: Ctx) => EntityId): EntityId;
	ref(refId: string): EntityId | undefined;
	remember(key: string, value: SerializableValue): void;
	recall(key: string): SerializableValue | undefined;
}>;

export type SequenceFactory<Ctx> = (
	api: SequenceApi<Ctx>,
) => Generator<Step<Ctx>, void, void>;

export type SequenceStatus = "running" | "done" | "error";

const MAX_SEEK_STEPS = 100000;

export class ResumableSequence<Ctx> {
	readonly state: SequenceState;

	private readonly factory: SequenceFactory<Ctx>;
	private readonly api: SequenceApi<Ctx>;
	private generator: Generator<Step<Ctx>, void, void>;
	private current: Step<Ctx> | null = null;
	private replaying = false;
	private world: Ctx | null = null;
	private statusValue: SequenceStatus = "running";
	private errorValue: Error | null = null;
	private seenIds = new Set<string>();

	constructor(
		factory: SequenceFactory<Ctx>,
		state: SequenceState = new SequenceState(),
	) {
		this.factory = factory;
		this.state = state;
		this.api = this.makeApi();
		this.generator = factory(this.api);
	}

	currentSkippable(world: Ctx): boolean {
		return this.current?.skippable?.(world) ?? true;
	}

	get status(): SequenceStatus {
		return this.statusValue;
	}

	get error(): Error | null {
		return this.errorValue;
	}

	get done(): boolean {
		return this.statusValue === "done";
	}

	update(world: Ctx, dt: Seconds): void {
		if (this.statusValue !== "running") {
			return;
		}
		this.world = world;
		try {
			if (this.current === null) {
				this.pump();
				if (this.statusValue !== "running") {
					return;
				}
			}
			const step = this.current;
			if (step === null) {
				return;
			}
			this.state.elapsedInStep += dt;
			const tick: SequenceTick = {
				dt,
				elapsed: this.state.elapsedInStep as Seconds,
			};
			if (step.poll(world, tick)) {
				this.current = null;
			}
		} catch (cause) {
			this.fail(cause);
		}
	}

	seek(target: SequenceState, world: Ctx): void {
		this.world = world;
		this.generator = this.factory(this.api);
		this.seenIds.clear();
		this.current = null;
		this.statusValue = "running";
		this.errorValue = null;
		this.state.perStepData = { ...target.perStepData };
		this.state.spawnedRefs = { ...target.spawnedRefs };
		this.state.stepId = "";
		this.state.elapsedInStep = 0;
		this.replaying = true;
		try {
			for (let guard = 0; guard < MAX_SEEK_STEPS; guard++) {
				const step = this.pump();
				if (step === null) {
					throw new Error(
						`seek exhausted the sequence without reaching step "${target.stepId}" (nondeterministic replay or unknown stepId)`,
					);
				}
				if (step.id === target.stepId) {
					this.state.stepId = target.stepId;
					this.state.elapsedInStep = target.elapsedInStep;
					this.replaying = false;
					return;
				}
			}
			throw new Error(
				`seek exceeded ${MAX_SEEK_STEPS} steps looking for "${target.stepId}"`,
			);
		} catch (cause) {
			this.replaying = false;
			this.fail(cause);
		}
	}

	private pump(): Step<Ctx> | null {
		const result = this.generator.next();
		if (result.done) {
			this.current = null;
			this.statusValue = "done";
			return null;
		}
		const id = result.value.id;
		if (this.seenIds.has(id)) {
			throw new Error(
				`duplicate step id "${id}" within a single sequence run; step ids must be unique so resume/seek is unambiguous`,
			);
		}
		this.seenIds.add(id);
		this.current = result.value;
		this.state.stepId = id;
		this.state.elapsedInStep = 0;
		return result.value;
	}

	private fail(cause: unknown): void {
		this.current = null;
		this.statusValue = "error";
		this.errorValue =
			cause instanceof Error ? cause : new Error(String(cause));
	}

	private ctx(): Ctx {
		if (this.world === null) {
			throw new Error("sequence effect ran without a world context");
		}
		return this.world;
	}

	private makeApi(): SequenceApi<Ctx> {
		return {
			step: (id, poll, skippable) => ({ id, poll, skippable }),
			effect: (fn) => {
				if (!this.replaying) {
					fn(this.ctx());
				}
			},
			read: (fn) => fn(this.ctx()),
			spawn: (refId, create) => {
				if (this.replaying) {
					const existing = this.state.spawnedRefs[refId];
					if (existing === undefined) {
						throw new Error(
							`spawn "${refId}" has no recorded handle to recover during replay`,
						);
					}
					return existing;
				}
				const id = create(this.ctx());
				this.state.spawnedRefs[refId] = id;
				return id;
			},
			ref: (refId) => this.state.spawnedRefs[refId],
			remember: (key, value) => {
				this.state.perStepData[key] = value;
			},
			recall: (key) => this.state.perStepData[key],
		};
	}
}
