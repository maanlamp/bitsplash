import type {
	RenderContext,
	RenderSystem,
	UpdateContext,
	UpdateSystem,
} from "./system";

type ComponentClass<T extends object = object> = abstract new (
	...args: any[]
) => T;
type ConcreteComponentClass<T extends object = object> = new (
	...args: any[]
) => T;
export type EntityId = ReturnType<
	typeof globalThis.crypto.randomUUID
>;

type CleanupHook<T extends object = object> = (
	component: T,
	id: EntityId,
) => void;

const MAX_FLUSH_ITERATIONS = 1000;

export class ECS {
	private components = new Map<
		EntityId,
		Map<ComponentClass, object>
	>();
	private updateSystems: UpdateSystem[] = [];
	private renderSystems: RenderSystem[] = [];
	private listeners = new Set<() => void>();
	private pendingDestroy = new Set<EntityId>();
	private cleanupHooks = new Map<
		ConcreteComponentClass,
		CleanupHook
	>();

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
		for (const component of components) {
			this.addComponent(id, component);
		}
		this.notify();
		return id;
	}

	addComponent<T extends object>(
		entity: EntityId,
		component: T,
	): void {
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
			this.notify();
		}
	}

	reset(): void {
		for (const id of this.components.keys()) {
			this.runCleanupHooks(id);
		}
		this.components.clear();
		this.pendingDestroy.clear();
		this.notify();
	}

	first<T extends object>(
		cls: ComponentClass<T>,
	): readonly [EntityId, T] | undefined {
		for (const [id, map] of this.components) {
			const component = map.get(cls) as T | undefined;
			if (component) {
				return [id, component];
			}
		}
		return undefined;
	}

	find<T extends object>(
		cls: ComponentClass<T>,
		predicate: (value: T) => boolean,
	): readonly [EntityId, T] | undefined {
		for (const [id, map] of this.components) {
			const component = map.get(cls) as T | undefined;
			if (component && predicate(component)) {
				return [id, component];
			}
		}
		return undefined;
	}

	query<T extends ComponentClass[]>(
		...classes: T
	): ReadonlyArray<
		[
			EntityId,
			...{
				[K in keyof T]: T[K] extends ComponentClass<infer C>
					? C
					: never;
			},
		]
	> {
		const results: Array<[EntityId, ...any[]]> = [];

		for (const [id, map] of this.components) {
			const resolved = classes.map((cls) => map.get(cls));
			if (resolved.every(Boolean)) {
				results.push([id, ...resolved]);
			}
		}

		return results as unknown as ReadonlyArray<
			[
				EntityId,
				...{
					[K in keyof T]: T[K] extends ComponentClass<infer C>
						? C
						: never;
				},
			]
		>;
	}

	entities(): ReadonlyArray<EntityId> {
		return [...this.components.keys()];
	}

	componentsOf(entity: EntityId): ReadonlyArray<object> {
		const map = this.components.get(entity);
		return map ? [...new Set(map.values())] : [];
	}

	addUpdateSystem(system: UpdateSystem): void {
		this.updateSystems.push(system);
	}

	removeUpdateSystem(system: UpdateSystem): void {
		const index = this.updateSystems.indexOf(system);
		if (index !== -1) {
			this.updateSystems.splice(index, 1);
		}
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
		for (const system of this.updateSystems) {
			system.update(ctx);
		}
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
	| "getComponent"
	| "entities"
	| "componentsOf"
	| "first"
	| "find"
>;
