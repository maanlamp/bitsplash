import {
	serializable,
	serialize,
} from "../serialization/serializable";
import Vector2 from "../vector2";

/**
 * A particle emitter attached to an entity: **pure authored config, and nothing
 * else**.
 *
 * Every field is `@serialize`d, which is the whole design. There is no particle
 * pool here, no spawn accumulator, no `fired` flag — all of that lives in
 * {@link VfxStore}, owned by the VFX system instance and keyed by entity id.
 * That inversion is what makes a leak unrepresentable rather than merely
 * unlikely: run-state is structurally invisible to `serializeWorld`, to the
 * editor's edit journal, and to the save tripwires, so an emitter previewing
 * live in the editor's edit world cannot drift the document, and a save blob
 * cannot carry a thousand dead particles.
 *
 * The component is **read-only to every system**. Systems reach it through
 * {@link readonlyEmitter}, which in dev builds hands back a frozen view that
 * throws on write — a stray system write would otherwise sail through and brick
 * saving via the edit-world save tripwire, which diffs a journal replay against
 * the live world serialized whole. The instance itself is deliberately *not*
 * frozen, because the editor's command router writes authored fields into the
 * live instance in place; freezing it would break the very authoring surface the
 * preview exists to serve.
 *
 * Config is re-read every frame and nothing derived is cached, so editing a
 * field in the inspector, undoing it, or hot-reloading the def all take effect
 * immediately with no invalidation protocol.
 *
 * @example
 * const emitter = new EmitterComponent();
 * emitter.defId = VFX_IDS.leaves;
 * ecs.addComponent(tree, emitter);
 */
@serializable("Emitter")
export class EmitterComponent {
	/** Effect id, resolved against the registered catalog. Empty emits nothing. */
	@serialize() defId = "";

	/** Whether the emitter emits. Existing particles still live out a disable. */
	@serialize() enabled = true;

	/**
	 * Per-instance intensity multiplier on every part's emission rate, so two
	 * trees can share one def and differ in density. Multiplies with weather
	 * scaling; does not affect burst counts.
	 */
	@serialize() rateScale = 1;

	/** Spawn origin offset from the host transform, in world units. */
	@serialize() offset = Vector2.zero();
}

/** The read-only view of an emitter every system consumes. */
export type ReadonlyEmitter = Readonly<EmitterComponent>;

/**
 * Dev builds pay for the runtime half of the read-only guarantee; production
 * builds get the compile-time half only ({@link ReadonlyEmitter}) and hand back
 * the instance itself, so the sim never touches a proxy.
 */
const DEV_BUILD = !import.meta.env.PROD;

const views = new WeakMap<EmitterComponent, ReadonlyEmitter>();

const refuseWrite = (field: string | symbol): never => {
	throw new Error(
		`EmitterComponent is authored config and read-only to systems; something tried to write "${String(field)}". Put run-state in the VfxStore instead — a write here would drift the editor's edit world and hard-crash the next save.`,
	);
};

/**
 * A system's view of an emitter: the same values, guaranteed not to be written.
 *
 * Cached per component instance, so re-reading config every frame costs one
 * `WeakMap` hit rather than an allocation. Caching the *view* is not caching
 * *derived config* — the fields are still read fresh through it every frame.
 *
 * @example
 * for (const [id, emitter] of ecs.query(EmitterComponent)) {
 *   const config = readonlyEmitter(emitter);
 * }
 */
export const readonlyEmitter = (
	emitter: EmitterComponent,
): ReadonlyEmitter => {
	if (!DEV_BUILD) {
		return emitter;
	}
	const cached = views.get(emitter);
	if (cached) {
		return cached;
	}
	const view = new Proxy(emitter, {
		set: (_target, field) => refuseWrite(field),
		defineProperty: (_target, field) => refuseWrite(field),
		deleteProperty: (_target, field) => refuseWrite(field),
	}) as ReadonlyEmitter;
	views.set(emitter, view);
	return view;
};
