import type { FrameProfile } from "./profiling/frame-profile";
import { profilerMeta } from "./profiling/profiler";
import type {
	RenderContext,
	RenderSystem,
	UpdateContext,
	UpdateSystem,
} from "./system";

type ComponentClass<T extends object = object> = abstract new (
	// oxlint-disable-next-line typescript/no-explicit-any -- constructor params are contravariant; `unknown[]` rejects real component classes
	...args: any[]
) => T;
type ConcreteComponentClass<T extends object = object> = new (
	// oxlint-disable-next-line typescript/no-explicit-any -- constructor params are contravariant; `unknown[]` rejects real component classes
	...args: any[]
) => T;
export type EntityId = ReturnType<
	typeof globalThis.crypto.randomUUID
>;

/** `[entityId, ...components]` as produced by `query`/`queryFirst`. */
type QueryTuple<T extends ComponentClass[]> = [
	EntityId,
	...{
		[K in keyof T]: T[K] extends ComponentClass<infer C> ? C : never;
	},
];

type CleanupHook<T extends object = object> = (
	component: T,
	id: EntityId,
) => void;

const MAX_FLUSH_ITERATIONS = 1000;

/** A resolved profiler label for one update system slot, or `null` if the
 * system's class is undecorated (it runs untimed). */
type UpdateLabel = Readonly<{ label: string; group?: string }> | null;

const warnedUndecorated = new WeakSet<object>();

export class ECS {
	private components = new Map<
		EntityId,
		Map<ComponentClass, object>
	>();
	private updateSystems: UpdateSystem[] = [];
	private updateLabels: UpdateLabel[] = [];
	private labelsDirty = true;
	private renderSystems: RenderSystem[] = [];
	private profile: FrameProfile | null = null;
	private listeners = new Set<() => void>();
	private pendingDestroy = new Set<EntityId>();
	private cleanupHooks = new Map<
		ConcreteComponentClass,
		CleanupHook
	>();
	private denseIds: EntityId[] = [];
	private denseMaps: Array<Map<ComponentClass, object>> = [];
	private denseDirty = true;
	private readonly queryScratch: Array<object | undefined> = [];
	private readonly firstScratch: Array<object | undefined> = [];

	/**
	 * Refresh the parallel `id`/`component map` arrays the scan paths walk.
	 *
	 * Iterating `Map` entries allocates a `[key, value]` pair per entry, which
	 * the query paths pay once per entity in the world per query per frame.
	 * These arrays mirror the map in insertion order and are rebuilt only when
	 * the entity set changes.
	 */
	private syncDense(): void {
		if (!this.denseDirty) {
			return;
		}
		this.denseIds.length = 0;
		this.denseMaps.length = 0;
		for (const [id, map] of this.components) {
			this.denseIds.push(id);
			this.denseMaps.push(map);
		}
		this.denseDirty = false;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	createEntity(
		components: ReadonlyArray<object> = [],
		id: EntityId = crypto.randomUUID(),
	): EntityId {
		if (this.components.has(id)) {
			throw new Error(
				`ECS.createEntity: entity id "${id}" already exists; refusing to silently overwrite it. Despawn/destroy (and flush) the existing entity, or reset the world, before recreating it with this id.`,
			);
		}
		this.components.set(id, new Map());
		this.denseDirty = true;
		for (const component of components) {
			this.addComponent(id, component);
		}
		this.notify();
		return id;
	}

	addComponent(entity: EntityId, component: object): void {
		const map = this.components.get(entity)!;
		let proto = Object.getPrototypeOf(component);
		while (proto && proto !== Object.prototype) {
			map.set(proto.constructor as ConcreteComponentClass, component);
			proto = Object.getPrototypeOf(proto);
		}
		this.notify();
	}

	getComponent<T extends object>(
		entity: EntityId,
		cls: ComponentClass<T>,
	): T | undefined {
		return this.components.get(entity)?.get(cls) as T | undefined;
	}

	removeComponent(entity: EntityId, cls: ComponentClass): void {
		this.components.get(entity)?.delete(cls);
		this.notify();
	}

	onDestroy<T extends object>(
		cls: ConcreteComponentClass<T>,
		hook: CleanupHook<T>,
	): void {
		this.cleanupHooks.set(cls, hook as CleanupHook);
	}

	/**
	 * Whether a cleanup hook is already installed for a component class.
	 *
	 * {@link onDestroy} is last-writer-wins, so a second registration silently
	 * unhooks the first. A registration site that owns its component's cleanup
	 * asserts on this first, turning that silent loss into a crash.
	 *
	 * @example
	 * if (ecs.hasDestroyHook(EmitterComponent)) {
	 *   throw new Error("another owner already claimed emitter cleanup");
	 * }
	 */
	hasDestroyHook(cls: ConcreteComponentClass): boolean {
		return this.cleanupHooks.has(cls);
	}

	destroy(entity: EntityId): void {
		this.pendingDestroy.add(entity);
	}

	private runCleanupHooks(entity: EntityId): void {
		for (const component of this.componentsOf(entity)) {
			this.cleanupHooks.get(
				component.constructor as ConcreteComponentClass,
			)?.(component, entity);
		}
	}

	flushDestroyed(): void {
		let anyDeleted = false;
		let guard = 0;
		while (this.pendingDestroy.size > 0) {
			if (++guard > MAX_FLUSH_ITERATIONS) {
				console.error(
					`ECS.flushDestroyed exceeded ${MAX_FLUSH_ITERATIONS} iterations; aborting drain`,
				);
				this.pendingDestroy.clear();
				break;
			}
			const batch = [...this.pendingDestroy];
			this.pendingDestroy.clear();
			for (const id of batch) {
				if (!this.components.has(id)) {
					continue;
				}
				this.runCleanupHooks(id);
				this.components.delete(id);
				anyDeleted = true;
			}
		}
		if (anyDeleted) {
			this.denseDirty = true;
			this.notify();
		}
	}

	reset(): void {
		for (const id of this.components.keys()) {
			this.runCleanupHooks(id);
		}
		this.components.clear();
		this.pendingDestroy.clear();
		this.denseDirty = true;
		this.notify();
	}

	first<T extends object>(
		cls: ComponentClass<T>,
	): readonly [EntityId, T] | undefined {
		this.syncDense();
		const maps = this.denseMaps;
		for (let i = 0; i < maps.length; i++) {
			const component = maps[i]!.get(cls) as T | undefined;
			if (component) {
				return [this.denseIds[i]!, component];
			}
		}
		return undefined;
	}

	find<T extends object>(
		cls: ComponentClass<T>,
		predicate: (value: T) => boolean,
	): readonly [EntityId, T] | undefined {
		this.syncDense();
		const maps = this.denseMaps;
		for (let i = 0; i < maps.length; i++) {
			const component = maps[i]!.get(cls) as T | undefined;
			if (component && predicate(component)) {
				return [this.denseIds[i]!, component];
			}
		}
		return undefined;
	}

	/**
	 * Every entity carrying all of `classes`, as `[id, ...components]` tuples.
	 *
	 * The scan itself allocates nothing per entity examined — component lookups
	 * go through an instance-owned scratch array and the entity set is walked
	 * through parallel arrays rather than `Map` entry pairs — so the only
	 * allocations are the result array and one tuple per **match**. Prefer
	 * {@link queryFirst} when a single entity is wanted: it returns at the first
	 * match and never builds the result array.
	 *
	 * @example
	 * for (const [id, transform, sprite] of ecs.query(TransformComponent, SpriteComponent)) {
	 *   renderer.draw(sprite, transform);
	 * }
	 */
	query<T extends ComponentClass[]>(
		...classes: T
	): ReadonlyArray<QueryTuple<T>> {
		this.syncDense();
		const scratch = this.queryScratch;
		scratch.length = classes.length;
		// oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous query tuple; `unknown` only moves the cast to every callsite
		const results: Array<[EntityId, ...any[]]> = [];
		const maps = this.denseMaps;

		for (let i = 0; i < maps.length; i++) {
			const map = maps[i]!;
			let matched = true;
			for (let c = 0; c < classes.length; c++) {
				const component = map.get(classes[c]!);
				if (component === undefined) {
					matched = false;
					break;
				}
				scratch[c] = component;
			}
			if (!matched) {
				continue;
			}
			// oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous query tuple; `unknown` only moves the cast to every callsite
			const tuple: [EntityId, ...any[]] = [this.denseIds[i]!];
			for (let c = 0; c < classes.length; c++) {
				tuple.push(scratch[c]);
			}
			results.push(tuple);
		}

		return results as unknown as ReadonlyArray<QueryTuple<T>>;
	}

	/**
	 * The first entity carrying all of `classes`, or `undefined`.
	 *
	 * Equivalent to `query(...classes)[0]` but stops at the first match and
	 * allocates only the returned tuple, so a singleton lookup costs neither a
	 * full world scan nor a result array. {@link first} is the single-component
	 * form.
	 *
	 * @example
	 * const state = ecs.queryFirst(WeatherStateComponent)?.[1];
	 */
	queryFirst<T extends ComponentClass[]>(
		...classes: T
	): QueryTuple<T> | undefined {
		this.syncDense();
		const scratch = this.firstScratch;
		scratch.length = classes.length;
		const maps = this.denseMaps;

		for (let i = 0; i < maps.length; i++) {
			const map = maps[i]!;
			let matched = true;
			for (let c = 0; c < classes.length; c++) {
				const component = map.get(classes[c]!);
				if (component === undefined) {
					matched = false;
					break;
				}
				scratch[c] = component;
			}
			if (!matched) {
				continue;
			}
			// oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous query tuple; `unknown` only moves the cast to every callsite
			const tuple: [EntityId, ...any[]] = [this.denseIds[i]!];
			for (let c = 0; c < classes.length; c++) {
				tuple.push(scratch[c]);
			}
			return tuple as QueryTuple<T>;
		}

		return undefined;
	}

	entities(): ReadonlyArray<EntityId> {
		return [...this.components.keys()];
	}

	componentsOf(entity: EntityId): ReadonlyArray<object> {
		const map = this.components.get(entity);
		return map ? [...new Set(map.values())] : [];
	}

	/**
	 * Attach (or detach with `null`) a per-world profiling sink. While attached,
	 * {@link update} brackets each system with `performance.now()` and records
	 * per-system self-times and the total update span into it. Disabled by
	 * default; the bundled game never attaches one.
	 */
	setProfile(profile: FrameProfile | null): void {
		this.profile = profile;
		this.labelsDirty = true;
	}

	addUpdateSystem(system: UpdateSystem): void {
		this.updateSystems.push(system);
		this.labelsDirty = true;
	}

	removeUpdateSystem(system: UpdateSystem): void {
		const index = this.updateSystems.indexOf(system);
		if (index !== -1) {
			this.updateSystems.splice(index, 1);
			this.labelsDirty = true;
		}
	}

	/**
	 * Resolve every update slot's profiler label in registration order,
	 * suffixing `#2`, `#3`, … when one label recurs so duplicate-class instances
	 * (e.g. two decoration systems) stay distinct. Resolved lazily on the first
	 * profiled frame after the system list changes — never when profiling is
	 * off — so `#n` follows stable insertion order and undecorated systems warn
	 * only in a profiled world.
	 */
	private resolveUpdateLabels(): void {
		const counts = new Map<string, number>();
		this.updateLabels = this.updateSystems.map((system) => {
			const meta = profilerMeta(system);
			if (!meta) {
				if (!warnedUndecorated.has(system.constructor)) {
					warnedUndecorated.add(system.constructor);
					console.warn(
						`ECS profiling: update system ${system.constructor.name} lacks a @profiler(name) decorator; it will run untimed.`,
					);
				}
				return null;
			}
			const n = (counts.get(meta.name) ?? 0) + 1;
			counts.set(meta.name, n);
			return {
				label: n === 1 ? meta.name : `${meta.name}#${n}`,
				group: meta.group,
			};
		});
	}

	addRenderSystem(system: RenderSystem): void {
		this.renderSystems.push(system);
	}

	removeRenderSystem(system: RenderSystem): void {
		const index = this.renderSystems.indexOf(system);
		if (index !== -1) {
			this.renderSystems.splice(index, 1);
		}
	}

	update(ctx: UpdateContext): void {
		const profile = this.profile;
		if (!profile) {
			for (const system of this.updateSystems) {
				system.update(ctx);
			}
			return;
		}
		if (this.labelsDirty) {
			this.resolveUpdateLabels();
			this.labelsDirty = false;
		}
		profile.reset();
		const spanStart = performance.now();
		const systems = this.updateSystems;
		const labels = this.updateLabels;
		for (let i = 0; i < systems.length; i++) {
			const label = labels[i];
			if (!label) {
				systems[i]!.update(ctx);
				continue;
			}
			const before = performance.now();
			systems[i]!.update(ctx);
			profile.record(
				label.label,
				performance.now() - before,
				label.group,
			);
		}
		profile.updateSpanMs = performance.now() - spanStart;
	}

	render(ctx: RenderContext): void {
		for (const system of this.renderSystems) {
			system.render(ctx);
		}
	}
}

export type ReadonlyECS = Pick<
	ECS,
	| "query"
	| "queryFirst"
	| "subscribe"
	| "getComponent"
	| "entities"
	| "componentsOf"
	| "first"
	| "find"
>;
