import type { EntityId } from "../ecs";
import { type OpNode, type PredicateRef, walkNodes } from "./op";
import {
	lookupCastResolver,
	lookupOpType,
	lookupPredicate,
	type OpContext,
} from "./op-registry";
import type { SequenceDef } from "./sequence-def";
import type { SequenceRunState } from "./sequence-run-state";

const stepIdCache = new WeakMap<SequenceDef, ReadonlySet<string>>();

const stepIdsOf = (def: SequenceDef): ReadonlySet<string> => {
	const cached = stepIdCache.get(def);
	if (cached) {
		return cached;
	}
	const ids = new Set<string>();
	walkNodes(def.root, (node) => ids.add(node.stepId));
	stepIdCache.set(def, ids);
	return ids;
};

export const validateRunState = (
	def: SequenceDef,
	run: SequenceRunState,
): void => {
	const ids = stepIdsOf(def);
	const check = (stepId: string, where: string): void => {
		if (!ids.has(stepId)) {
			throw new Error(
				`sequence "${def.id}": saved run-state references step "${stepId}" (${where}) which no longer exists in the def; the save is stale against an edited def (rule 8)`,
			);
		}
	};
	for (const stepId of run.completed) {
		check(stepId, "completed");
	}
	for (const stepId of Object.keys(run.memory)) {
		check(stepId, "memory");
	}
	for (const stepId of Object.keys(run.pinnedBranches)) {
		check(stepId, "pinnedBranches");
	}
};

export const resolveActor = (
	run: SequenceRunState,
	ref: string,
): EntityId | null => {
	const bound = run.cast[ref] ?? run.spawnedRefs[ref];
	return bound === undefined ? null : (bound as EntityId);
};

/**
 * Bind cast roles to entities, filling only roles not yet bound and leaving
 * already-bound roles untouched. Called every tick so a role whose entity does
 * not exist when the sequence starts (e.g. a `byTag` actor another sequence
 * spawns later) binds as soon as it appears, rather than staying `null` and
 * crashing a downstream op that requires it.
 */
export const resolveCast = (
	def: SequenceDef,
	ctx: OpContext,
): void => {
	for (const [role, ref] of Object.entries(def.cast)) {
		if (ctx.run.cast[role] !== undefined) {
			continue;
		}
		const resolver = lookupCastResolver(ref.resolver);
		const entity = resolver(ctx, ref.params ?? {});
		if (entity !== null) {
			ctx.run.cast[role] = entity;
		}
	}
};

const evalPredicate = (cond: PredicateRef, ctx: OpContext): boolean =>
	lookupPredicate(cond.predicate)(ctx, cond.params);

const branchOutcome = (
	stepId: string,
	cond: PredicateRef,
	ctx: OpContext,
): boolean => {
	const pinned = ctx.run.pinnedBranches[stepId];
	if (pinned !== undefined) {
		return pinned;
	}
	const decided = evalPredicate(cond, ctx);
	ctx.run.pinnedBranches[stepId] = decided;
	return decided;
};

const tickNode = (node: OpNode, ctx: OpContext): boolean => {
	const run = ctx.run;
	if (run.isDone(node.stepId)) {
		return true;
	}
	switch (node.kind) {
		case "seq": {
			for (const child of node.children) {
				if (run.isDone(child.stepId)) {
					continue;
				}
				if (!tickNode(child, ctx)) {
					return false;
				}
			}
			run.markDone(node.stepId);
			return true;
		}
		case "parallel": {
			let all = true;
			for (const child of node.children) {
				if (run.isDone(child.stepId)) {
					continue;
				}
				if (!tickNode(child, ctx)) {
					all = false;
				}
			}
			if (all) {
				run.markDone(node.stepId);
			}
			return all;
		}
		case "branch": {
			const chosen = branchOutcome(node.stepId, node.cond, ctx)
				? node.whenTrue
				: node.whenFalse;
			if (chosen === null || tickNodeOrDone(chosen, ctx)) {
				run.markDone(node.stepId);
				return true;
			}
			return false;
		}
		case "wait": {
			const memory = run.memoryFor(node.stepId);
			const elapsed = ((memory.elapsed as number) ?? 0) + ctx.dt;
			memory.elapsed = elapsed;
			if (elapsed >= node.seconds) {
				run.markDone(node.stepId);
				return true;
			}
			return false;
		}
		case "waitUntil": {
			if (evalPredicate(node.cond, ctx)) {
				run.markDone(node.stepId);
				return true;
			}
			return false;
		}
		case "op": {
			const executor = lookupOpType(node.type);
			const memory = run.memoryFor(node.stepId);
			executor.arm(ctx, node.params, memory);
			if (executor.poll(ctx, node.params, memory)) {
				run.markDone(node.stepId);
				return true;
			}
			return false;
		}
	}
};

const tickNodeOrDone = (node: OpNode, ctx: OpContext): boolean =>
	ctx.run.isDone(node.stepId) ? true : tickNode(node, ctx);

/**
 * Whether a fast-forward is worth offering here — what drives the skip HUD and
 * gates the skip input. It is deliberately conservative: `seq` and `parallel`
 * answer for *every* child, reached or not, so one unskippable step makes the
 * whole sequence unskippable throughout.
 *
 * It is not a precondition of {@link skipSequence}: handlers decline for
 * themselves by returning `false` from `skip`, and a `waitUntil` always does.
 */
const nodeSkippable = (node: OpNode, ctx: OpContext): boolean => {
	const run = ctx.run;
	if (run.isDone(node.stepId)) {
		return true;
	}
	switch (node.kind) {
		case "seq":
		case "parallel":
			return node.children.every((child) =>
				nodeSkippable(child, ctx),
			);
		case "branch": {
			const pinned = ctx.run.pinnedBranches[node.stepId];
			const decided =
				pinned !== undefined ? pinned : evalPredicate(node.cond, ctx);
			const chosen = decided ? node.whenTrue : node.whenFalse;
			return chosen === null || nodeSkippable(chosen, ctx);
		}
		case "wait":
		case "waitUntil":
			return true;
		case "op": {
			const executor = lookupOpType(node.type);
			return (
				executor.skippable?.(
					ctx,
					node.params,
					run.memoryFor(node.stepId),
				) ?? true
			);
		}
	}
};

const skipNode = (node: OpNode, ctx: OpContext): boolean => {
	const run = ctx.run;
	if (run.isDone(node.stepId)) {
		return true;
	}
	switch (node.kind) {
		case "seq": {
			for (const child of node.children) {
				if (!skipNode(child, ctx)) {
					return false;
				}
			}
			run.markDone(node.stepId);
			return true;
		}
		case "parallel": {
			let all = true;
			for (const child of node.children) {
				if (!skipNode(child, ctx)) {
					all = false;
				}
			}
			if (all) {
				run.markDone(node.stepId);
			}
			return all;
		}
		case "branch": {
			const chosen = branchOutcome(node.stepId, node.cond, ctx)
				? node.whenTrue
				: node.whenFalse;
			if (chosen === null || skipNode(chosen, ctx)) {
				run.markDone(node.stepId);
				return true;
			}
			return false;
		}
		case "wait": {
			run.markDone(node.stepId);
			return true;
		}
		case "waitUntil":
			return false;
		case "op": {
			const executor = lookupOpType(node.type);
			if (
				!executor.skip(ctx, node.params, run.memoryFor(node.stepId))
			) {
				return false;
			}
			run.markDone(node.stepId);
			return true;
		}
	}
};

export const tickSequence = (
	def: SequenceDef,
	ctx: OpContext,
): boolean => {
	validateRunState(def, ctx.run);
	return tickNode(def.root, ctx);
};

export const skipSequence = (
	def: SequenceDef,
	ctx: OpContext,
): boolean => {
	validateRunState(def, ctx.run);
	return skipNode(def.root, ctx);
};

export const sequenceSkippable = (
	def: SequenceDef,
	ctx: OpContext,
): boolean => nodeSkippable(def.root, ctx);

export const activeFrontier = (
	def: SequenceDef,
	run: SequenceRunState,
): ReadonlyArray<OpNode> => {
	const frontier: OpNode[] = [];
	const visit = (node: OpNode): void => {
		if (run.isDone(node.stepId)) {
			return;
		}
		if (node.kind === "seq") {
			const next = node.children.find((c) => !run.isDone(c.stepId));
			if (next) {
				visit(next);
			}
			return;
		}
		if (node.kind === "parallel") {
			for (const child of node.children) {
				visit(child);
			}
			return;
		}
		if (node.kind === "branch") {
			const pinned = run.pinnedBranches[node.stepId];
			if (pinned === undefined) {
				frontier.push(node);
				return;
			}
			const chosen = pinned ? node.whenTrue : node.whenFalse;
			if (chosen) {
				visit(chosen);
			}
			return;
		}
		frontier.push(node);
	};
	visit(def.root);
	return frontier;
};
