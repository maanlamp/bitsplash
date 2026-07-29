import type { EntityId, ReadonlyECS } from "../ecs";
import { randomRngSeed, rngNext } from "../rng";
import { EmitterComponent } from "./emitter-component";
import type { VfxDef, VfxEmitterPart } from "./vfx-def";
import { resolveVfxDef } from "./vfx-registry";

/**
 * All VFX run-state, and the only place it exists.
 *
 * A store is an **instance field of the VFX system pair** — never a module
 * singleton and never a `WeakMap` keyed by anything else — because the editor's
 * edit world and its run world are separate worlds that share entity ids: a
 * shared store would cross-talk between them. `createVfxSystems` builds one
 * store and hands the same instance to the update and render systems, so each
 * world's pools belong to that world's systems and die with them.
 *
 * Because pools are typed arrays in a system field rather than components,
 * `serializeWorld` cannot see them, the editor's journal cannot record them, and
 * the save tripwires have nothing to diff. That is the structural guarantee; see
 * the VFX doctrine note in `AGENTS.md` for why the state is deliberately
 * non-restorable.
 */

const FLAG_REACTS = 1;
const FLAG_RESTING = 2;

/**
 * One emitter part's particle pool, structure-of-arrays.
 *
 * Live particles are packed into `[0, count)`; a death swaps the last live
 * particle into the freed slot, so the loop stays contiguous and nothing needs a
 * liveness test.
 */
export class VfxPool {
	readonly capacity: number;
	/** Live particles, packed at the front of every array. */
	count = 0;
	/** Fractional spawn debt carried between frames. */
	accumulator = 0;
	/**
	 * Whether positions are relative to the host transform. Starts true for a
	 * `local` part and flips to false when a dying host bakes the pool into world
	 * space so it can live out.
	 */
	local: boolean;

	readonly x: Float32Array;
	readonly y: Float32Array;
	readonly vx: Float32Array;
	readonly vy: Float32Array;
	readonly age: Float32Array;
	readonly life: Float32Array;
	readonly size: Float32Array;
	readonly rotation: Float32Array;
	readonly spin: Float32Array;
	readonly flags: Uint8Array;

	constructor(capacity: number, local: boolean) {
		this.capacity = capacity;
		this.local = local;
		this.x = new Float32Array(capacity);
		this.y = new Float32Array(capacity);
		this.vx = new Float32Array(capacity);
		this.vy = new Float32Array(capacity);
		this.age = new Float32Array(capacity);
		this.life = new Float32Array(capacity);
		this.size = new Float32Array(capacity);
		this.rotation = new Float32Array(capacity);
		this.spin = new Float32Array(capacity);
		this.flags = new Uint8Array(capacity);
	}

	/** Whether particle `i` reacts to collision at all (pre-rolled at spawn). */
	reacts(i: number): boolean {
		return (this.flags[i]! & FLAG_REACTS) !== 0;
	}

	/** Whether particle `i` has come to rest on a tile. */
	resting(i: number): boolean {
		return (this.flags[i]! & FLAG_RESTING) !== 0;
	}

	/** Park particle `i` where it is for the rest of its life. */
	rest(i: number): void {
		this.flags[i] = this.flags[i]! | FLAG_RESTING;
		this.vx[i] = 0;
		this.vy[i] = 0;
		this.spin[i] = 0;
	}

	/**
	 * Drop particle `i` by swapping the last live particle into its slot. The
	 * caller must not advance its loop index afterwards — the slot now holds an
	 * unvisited particle.
	 */
	kill(i: number): void {
		const last = this.count - 1;
		if (i !== last) {
			this.x[i] = this.x[last]!;
			this.y[i] = this.y[last]!;
			this.vx[i] = this.vx[last]!;
			this.vy[i] = this.vy[last]!;
			this.age[i] = this.age[last]!;
			this.life[i] = this.life[last]!;
			this.size[i] = this.size[last]!;
			this.rotation[i] = this.rotation[last]!;
			this.spin[i] = this.spin[last]!;
			this.flags[i] = this.flags[last]!;
		}
		this.count = last;
	}
}

/**
 * One running effect: an instance of a {@link VfxDef}, either attached to a host
 * entity or loose in the world.
 */
export type VfxEffect = {
	/** Host entity, or `null` for a one-shot burst and for lived-out remnants. */
	readonly host: EntityId | null;
	/**
	 * The def object this instance was built from. Identity-compared every frame:
	 * a re-registered catalog (hot reload) or a changed `defId` yields a different
	 * object and the effect is rebuilt, which is the whole invalidation protocol.
	 */
	readonly def: VfxDef;
	/** Whether the effect still emits. False after a burst, a disable, or a host death. */
	emitting: boolean;
	/** Last known host origin in world units, including the emitter's offset. */
	originX: number;
	originY: number;
	/** One pool per part of {@link def}, index-aligned. */
	readonly pools: ReadonlyArray<VfxPool>;
};

/**
 * Where a spawn lands: a centre, the extents it scatters over, and a heading
 * rotation applied on top of the part's authored angle range.
 *
 * The centre is expressed **in the pool's own space** — zero for a local pool
 * riding its host, a world position for a loose one — which is what keeps the
 * store ignorant of spawn shapes and cameras.
 */
export type VfxEmitOrigin = Readonly<{
	x: number;
	y: number;
	spreadX: number;
	spreadY: number;
	angle: number;
}>;

/** Total live particles across an effect's pools. */
const effectParticleCount = (effect: VfxEffect): number => {
	let total = 0;
	for (const pool of effect.pools) {
		total += pool.count;
	}
	return total;
};

const buildPools = (def: VfxDef): VfxPool[] =>
	def.parts.map(
		(part) => new VfxPool(part.capacity, part.space === "local"),
	);

export class VfxStore {
	private readonly attached = new Map<EntityId, VfxEffect>();
	private readonly loose: VfxEffect[] = [];
	private rng: number;

	/**
	 * @param seed Pinned PRNG seed. Omit for an unpredictable one; pass a fixed
	 * value in tests that assert on drawn values.
	 */
	constructor(seed: number = randomRngSeed()) {
		this.rng = seed;
	}

	/** A draw in `[0, 1)`, advancing the store's generator. */
	random(): number {
		const [value, next] = rngNext(this.rng);
		this.rng = next;
		return value;
	}

	/** A draw in `[min, max]`. */
	between(min: number, max: number): number {
		return min === max ? min : min + (max - min) * this.random();
	}

	/** The effect running for a host entity, or `null` when none is. */
	attachedEffect(host: EntityId): VfxEffect | null {
		return this.attached.get(host) ?? null;
	}

	/**
	 * Build a fresh effect for a host, discarding whatever ran before. Called
	 * when an emitter first appears and whenever its def changes identity, which
	 * is what makes def hot-reload and undo/redo take effect with no invalidation
	 * bookkeeping.
	 */
	replaceAttached(
		host: EntityId,
		def: VfxDef,
		originX: number,
		originY: number,
	): VfxEffect {
		const effect: VfxEffect = {
			host,
			def,
			emitting: true,
			originX,
			originY,
			pools: buildPools(def),
		};
		this.attached.set(host, effect);
		return effect;
	}

	/**
	 * Drop a host's effect and its particles outright — the inspector removed the
	 * emitter component, so the effect was never meant to exist.
	 */
	dropAttached(host: EntityId): void {
		this.attached.delete(host);
	}

	/**
	 * Stop a host's emission and let its particles finish their lifetime.
	 *
	 * This is host-death live-out: the frame the host dies emission ends, but
	 * embers already in the air keep travelling. `local` pools are baked into
	 * world space first, because their frame of reference just ceased to exist.
	 *
	 * A scene change destroys its entities the same way, so a remnant can outlive
	 * the scene that made it — bounded by the part's longest lifetime, and accepted
	 * as cosmetic. Tightening it needs a scene-transition signal the runtime does
	 * not currently expose.
	 */
	detach(host: EntityId): void {
		const effect = this.attached.get(host);
		if (!effect) {
			return;
		}
		this.attached.delete(host);
		effect.emitting = false;
		if (effectParticleCount(effect) === 0) {
			return;
		}
		for (const pool of effect.pools) {
			if (!pool.local) {
				continue;
			}
			for (let i = 0; i < pool.count; i++) {
				pool.x[i] = pool.x[i]! + effect.originX;
				pool.y[i] = pool.y[i]! + effect.originY;
			}
			pool.local = false;
		}
		this.loose.push({ ...effect, host: null });
	}

	/**
	 * Evict every attached effect whose emitter is gone, testing **entity and
	 * component** presence: `getComponent` misses both a destroyed entity and a
	 * live entity whose component the inspector removed, and either means the
	 * effect must go.
	 *
	 * The `ecs.onDestroy` hook the update system installs normally handles
	 * destruction first (turning it into a live-out rather than a drop); this poll
	 * is the backstop for component removal, which fires no hook at all.
	 */
	evict(ecs: ReadonlyECS): void {
		for (const host of this.attached.keys()) {
			if (ecs.getComponent(host, EmitterComponent) === undefined) {
				this.dropAttached(host);
			}
		}
	}

	/**
	 * Fire a one-shot effect at a world position — the entry point for every
	 * transient: a blood spurt off a hit, a splash where a raindrop died.
	 *
	 * Transient effects are not entities and not components. Each part emits its
	 * authored `burst` count once and the effect then lives out and disappears;
	 * continuous `rate` is ignored, and `camera-band` parts are skipped, both
	 * because a one-shot has a place and a moment rather than a view and a
	 * duration.
	 *
	 * @param angle Radians added to every part's authored heading, so a burst can
	 * be aimed away from an impact.
	 *
	 * @example
	 * store.spawnBurst(VFX_IDS.blood, hit.x, hit.y, Math.atan2(away.y, away.x));
	 */
	spawnBurst(defId: string, x: number, y: number, angle = 0): void {
		const def = resolveVfxDef(defId);
		const effect: VfxEffect = {
			host: null,
			def,
			emitting: false,
			originX: x,
			originY: y,
			pools: buildPools(def),
		};
		let any = false;
		for (let p = 0; p < def.parts.length; p++) {
			const part = def.parts[p]!;
			if (part.burst === 0 || part.spawn.kind === "camera-band") {
				continue;
			}
			const local = part.space === "local";
			this.emit(effect.pools[p]!, part, part.burst, {
				x: local ? 0 : x,
				y: local ? 0 : y,
				spreadX: part.spawn.kind === "box" ? part.spawn.width : 0,
				spreadY: part.spawn.kind === "box" ? part.spawn.height : 0,
				angle,
			});
			any = true;
		}
		if (any) {
			this.loose.push(effect);
		}
	}

	/**
	 * Spawn `count` particles into a pool, drawing every per-particle value from
	 * the part's ranges.
	 *
	 * Silently stops at capacity: a pool sized from rate, lifetime, and burst can
	 * only overflow when several frames' spawn debt lands at once, and dropping
	 * the excess is the correct response to that.
	 */
	emit(
		pool: VfxPool,
		part: VfxEmitterPart,
		count: number,
		origin: VfxEmitOrigin,
	): void {
		for (let n = 0; n < count && pool.count < pool.capacity; n++) {
			const i = pool.count++;
			const angle =
				this.between(part.angle.min, part.angle.max) + origin.angle;
			const speed = this.between(part.speed.min, part.speed.max);
			pool.life[i] = this.between(
				part.lifetime.min,
				part.lifetime.max,
			);
			pool.age[i] = 0;
			pool.size[i] = this.between(part.size.min, part.size.max);
			pool.vx[i] = Math.cos(angle) * speed;
			pool.vy[i] = Math.sin(angle) * speed;
			pool.rotation[i] = this.between(
				part.rotation.min,
				part.rotation.max,
			);
			pool.spin[i] = this.between(part.spin.min, part.spin.max);
			pool.flags[i] =
				part.collision.mode === "tiles" &&
				this.random() < part.collision.restChance
					? FLAG_REACTS
					: 0;
			pool.x[i] = origin.x + (this.random() - 0.5) * origin.spreadX;
			pool.y[i] = origin.y + (this.random() - 0.5) * origin.spreadY;
		}
	}

	/** Every running effect: hosted emitters first, then loose one-shots and remnants. */
	effects(): ReadonlyArray<VfxEffect> {
		return [...this.attached.values(), ...this.loose];
	}

	/** Drop loose effects that have stopped emitting and hold no particles. */
	pruneLoose(): void {
		for (let i = this.loose.length - 1; i >= 0; i--) {
			const effect = this.loose[i]!;
			if (!effect.emitting && effectParticleCount(effect) === 0) {
				this.loose.splice(i, 1);
			}
		}
	}

	/** Live particles for a host's effect, or zero when it has none. */
	particleCount(host: EntityId): number {
		const effect = this.attached.get(host);
		return effect ? effectParticleCount(effect) : 0;
	}

	/** Live particles across every effect in this world. */
	totalParticles(): number {
		let total = 0;
		for (const effect of this.attached.values()) {
			total += effectParticleCount(effect);
		}
		for (const effect of this.loose) {
			total += effectParticleCount(effect);
		}
		return total;
	}

	/** Number of loose one-shots and lived-out remnants currently running. */
	looseCount(): number {
		return this.loose.length;
	}
}
