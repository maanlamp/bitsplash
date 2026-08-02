import type AssetManager from "../assets";
import type { AudioApi } from "../audio/audio-api";
import type { Seconds } from "../duration";
import type { ECS, EntityId } from "../ecs";
import type EventBus from "../events";
import type { World } from "../world";
import type { OpParams } from "./op";
import type { SequenceClass } from "./sequence-def";
import type { SequenceRunState } from "./sequence-run-state";
import type { SerializableValue } from "../serialization/serializable-value";

export type OpMemory = Record<string, SerializableValue>;

export type OpContext = Readonly<{
	ecs: ECS;
	world: World;
	events: EventBus;
	assetManager: AssetManager;
	audio: AudioApi;
	dt: Seconds;
	entityId: EntityId;
	sequenceClass: SequenceClass;
	run: SequenceRunState;
}>;

export type OpExecutor = Readonly<{
	arm(ctx: OpContext, params: OpParams, memory: OpMemory): void;
	poll(ctx: OpContext, params: OpParams, memory: OpMemory): boolean;
	/**
	 * Fast-forward this op to its finished state. Return `true` when the op is
	 * done and the interpreter may mark the step complete, or `false` to halt the
	 * fast-forward pass here and hand control back — what an op does when it
	 * needs the player, such as a dialogue with choices pending.
	 */
	skip(ctx: OpContext, params: OpParams, memory: OpMemory): boolean;
	skippable?(
		ctx: OpContext,
		params: OpParams,
		memory: OpMemory,
	): boolean;
}>;

export type Predicate = (ctx: OpContext, params: OpParams) => boolean;

export type CastResolver = (
	ctx: OpContext,
	params: OpParams,
) => EntityId | null;

export type SequenceEffect = (
	ctx: OpContext,
	params: OpParams,
) => void;

const opTypes = new Map<string, OpExecutor>();
const predicates = new Map<string, Predicate>();
const castResolvers = new Map<string, CastResolver>();
const effects = new Map<string, SequenceEffect>();

export const registerOpType = (
	id: string,
	executor: OpExecutor,
): void => {
	opTypes.set(id, executor);
};

export const registerPredicate = (
	id: string,
	predicate: Predicate,
): void => {
	predicates.set(id, predicate);
};

export const registerCastResolver = (
	id: string,
	resolver: CastResolver,
): void => {
	castResolvers.set(id, resolver);
};

export const registerEffect = (
	id: string,
	effect: SequenceEffect,
): void => {
	effects.set(id, effect);
};

export const lookupOpType = (id: string): OpExecutor => {
	const executor = opTypes.get(id);
	if (!executor) {
		throw new Error(
			`sequence op type "${id}" is not registered (rule 8: unknown id crashes loudly)`,
		);
	}
	return executor;
};

export const lookupPredicate = (id: string): Predicate => {
	const predicate = predicates.get(id);
	if (!predicate) {
		throw new Error(
			`sequence predicate "${id}" is not registered (rule 8: unknown id crashes loudly)`,
		);
	}
	return predicate;
};

export const lookupCastResolver = (id: string): CastResolver => {
	const resolver = castResolvers.get(id);
	if (!resolver) {
		throw new Error(
			`sequence cast resolver "${id}" is not registered (rule 8: unknown id crashes loudly)`,
		);
	}
	return resolver;
};

export const lookupEffect = (id: string): SequenceEffect => {
	const effect = effects.get(id);
	if (!effect) {
		throw new Error(
			`sequence effect "${id}" is not registered (rule 8: unknown id crashes loudly)`,
		);
	}
	return effect;
};
