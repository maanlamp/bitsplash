type SystemClass = abstract new (...args: any[]) => object;

/** Profiler metadata attached to an update-system class by {@link profiler}. */
export type ProfilerMeta = Readonly<{ name: string; group?: string }>;

const metaByClass = new WeakMap<SystemClass, ProfilerMeta>();

/**
 * Class decorator tagging an update system with an **explicit** profiler label
 * and an optional group, mirroring `@serializable`'s explicit-name discipline:
 * there is no `constructor.name` fallback, so minified builds keep stable
 * labels. Read back per instance via {@link profilerMeta}.
 *
 * @example
 * ⁠@profiler("Physics", "Physics")
 * export class PhysicsSystem extends UpdateSystem { ... }
 */
export const profiler =
	(name: string, group?: string) =>
	(ctor: SystemClass, _context: ClassDecoratorContext): void => {
		metaByClass.set(ctor, { name, group });
	};

/**
 * The profiler metadata for a system instance, or `undefined` when its class is
 * not decorated with {@link profiler}.
 */
export const profilerMeta = (
	system: object,
): ProfilerMeta | undefined =>
	metaByClass.get(system.constructor as SystemClass);
