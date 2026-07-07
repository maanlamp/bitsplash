import type { Seconds } from "../duration";

export type MachineInfo<S extends string> = {
	elapsed: Seconds;
	current: S;
	in(state: S): boolean;
};

export type Guard<S extends string, P> = (
	ctx: P,
	m: MachineInfo<S>,
) => boolean;

export type Transition<S extends string, P> = {
	to: S;
	when: Guard<S, P>;
	priority?: number;
	label?: string;
};

export type StateDef<S extends string, P> = {
	transitions?: Transition<S, P>[];
	children?: S[];
	initial?: S;
};

export type Machine<S extends string, P> = {
	initial: NoInfer<S>;
	root?: Transition<NoInfer<S>, P>[];
	states: Record<S, StateDef<NoInfer<S>, P>>;
};

export type RunState<S extends string> = {
	current: S;
	elapsed: Seconds;
};

export type StepResult<S extends string> = {
	next: RunState<S>;
	entered: S[];
	exited: S[];
};

export type CompiledMachine<S extends string, P> = {
	readonly initialLeaf: S;
	start(): RunState<S>;
	parentOf(state: S): S | null;
	path(state: S): readonly S[];
	step(run: RunState<S>, ctx: P, dt: Seconds): StepResult<S>;
};

type Candidate<S extends string, P> = {
	transition: Transition<S, P>;
	order: number;
};

export const defineMachine =
	<P>() =>
	<const S extends string>(
		machine: Machine<S, P>,
	): CompiledMachine<S, P> => {
		const ids = Object.keys(machine.states) as S[];
		const idSet = new Set<S>(ids);

		const require = (id: S, where: string): void => {
			if (!idSet.has(id)) {
				throw new Error(
					`[fsm] ${where} references unknown state "${id}"`,
				);
			}
		};

		const parent = new Map<S, S>();
		for (const id of ids) {
			const def = machine.states[id];
			if (def.children && def.children.length > 0) {
				for (const child of def.children) {
					require(child, `state "${id}" children`);
					if (parent.has(child)) {
						throw new Error(
							`[fsm] state "${child}" has more than one parent`,
						);
					}
					parent.set(child, id);
				}
				if (def.initial === undefined) {
					throw new Error(
						`[fsm] super-state "${id}" must declare an "initial" child`,
					);
				}
				require(def.initial, `super-state "${id}" initial`);
				if (!def.children.includes(def.initial)) {
					throw new Error(
						`[fsm] super-state "${id}" initial "${def.initial}" is not one of its children`,
					);
				}
			}
			for (const t of def.transitions ?? []) {
				require(t.to, `transition in state "${id}"`);
			}
		}
		for (const t of machine.root ?? []) {
			require(t.to, "root transition");
		}
		require(machine.initial, "machine initial");

		const pathCache = new Map<S, S[]>();
		const path = (state: S): S[] => {
			const cached = pathCache.get(state);
			if (cached) {
				return cached;
			}
			const chain: S[] = [];
			let cursor: S | undefined = state;
			const seen = new Set<S>();
			while (cursor !== undefined) {
				if (seen.has(cursor)) {
					throw new Error(
						`[fsm] cycle detected in ancestry of "${state}"`,
					);
				}
				seen.add(cursor);
				chain.push(cursor);
				cursor = parent.get(cursor);
			}
			pathCache.set(state, chain);
			return chain;
		};
		for (const id of ids) {
			path(id);
		}

		const descendToLeaf = (state: S): S => {
			let cursor = state;
			let def = machine.states[cursor];
			while (def.children && def.children.length > 0) {
				cursor = def.initial as S;
				def = machine.states[cursor];
			}
			return cursor;
		};

		const initialLeaf = descendToLeaf(machine.initial);

		const info = (current: S, elapsed: Seconds): MachineInfo<S> => {
			const active = path(current);
			return {
				current,
				elapsed,
				in: (state) => active.includes(state),
			};
		};

		const step = (
			run: RunState<S>,
			ctx: P,
			dt: Seconds,
		): StepResult<S> => {
			const elapsed = (run.elapsed + dt) as Seconds;
			const m = info(run.current, elapsed);

			const candidates: Candidate<S, P>[] = [];
			let order = 0;
			for (const state of path(run.current)) {
				for (const t of machine.states[state].transitions ?? []) {
					candidates.push({ transition: t, order: order++ });
				}
			}
			for (const t of machine.root ?? []) {
				candidates.push({ transition: t, order: order++ });
			}
			candidates.sort((a, b) => {
				const pa = a.transition.priority ?? 0;
				const pb = b.transition.priority ?? 0;
				if (pa !== pb) {
					return pb - pa;
				}
				return a.order - b.order;
			});

			let fired: Transition<S, P> | null = null;
			for (const candidate of candidates) {
				if (candidate.transition.when(ctx, m)) {
					fired = candidate.transition;
					break;
				}
			}

			if (!fired) {
				return {
					next: { current: run.current, elapsed },
					entered: [],
					exited: [],
				};
			}

			const newLeaf = descendToLeaf(fired.to);
			const oldPath = path(run.current);
			const newPath = path(newLeaf);
			const newSet = new Set(newPath);

			let lca: S | null = null;
			for (const state of oldPath) {
				if (newSet.has(state)) {
					lca = state;
					break;
				}
			}

			const exited: S[] = [];
			for (const state of oldPath) {
				if (state === lca) {
					break;
				}
				exited.push(state);
			}

			const entered: S[] = [];
			for (const state of newPath) {
				if (state === lca) {
					break;
				}
				entered.push(state);
			}
			entered.reverse();

			return {
				next: { current: newLeaf, elapsed: 0 as Seconds },
				entered,
				exited,
			};
		};

		return {
			initialLeaf,
			start: () => ({ current: initialLeaf, elapsed: 0 as Seconds }),
			parentOf: (state) => parent.get(state) ?? null,
			path,
			step,
		};
	};
