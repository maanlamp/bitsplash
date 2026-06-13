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

export class ECS {
	private components = new Map<
		EntityId,
		Map<ComponentClass, object>
	>();
	private updateSystems: UpdateSystem[] = [];
	private renderSystems: RenderSystem[] = [];
	private listeners = new Set<() => void>();

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

	destroyEntity(entity: EntityId): void {
		this.components.delete(entity);
		this.notify();
	}

	reset(): void {
		this.components.clear();
		this.notify();
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
	"query" | "getComponent" | "entities" | "componentsOf"
>;
