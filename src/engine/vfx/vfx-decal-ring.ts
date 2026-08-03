import type { EntityId, ReadonlyECS } from "../ecs";
import { TransformComponent } from "../transform-component";
import type { VfxDecalSpec } from "./vfx-def";

/**
 * Every decal in a world: the oriented quads colliding particles leave behind.
 *
 * A **capped ring buffer**, structure-of-arrays, owned by {@link VfxStore} and
 * therefore by the VFX system instance. Decals are not components and not
 * entities, so `serializeWorld`, the editor's journal and the save tripwires
 * cannot see them — the same structural guarantee the particle pools rest on,
 * and the reason a smear cannot end up in a scene file.
 *
 * The cap is the whole memory story: writing past the end recycles the oldest
 * slot, so a long fight fades its earliest blood rather than growing without
 * bound. Nothing here reallocates after construction.
 *
 * A decal is either **world-static** — pinned where it landed, which is what
 * terrain gets — or **host-attached**, storing a body-space offset against an
 * entity id so the mark rides its victim. Attached decals clear the moment their
 * host stops existing: entity ids are reused on respawn, so a dangling reference
 * would teleport somebody else's blood onto a fresh enemy.
 *
 * Attached marks do not mirror when their host flips; a smear painted on a
 * left-facing body stays on that side of it. That is an accepted limitation of
 * storing a plain offset rather than a body-space transform.
 */

/**
 * Decals a world keeps at once. Past this the oldest is recycled — a ceiling on
 * both VRAM churn and the per-frame sweep, which walks every slot.
 */
export const VFX_MAX_DECALS = 256;

export class VfxDecalRing {
	readonly capacity: number;
	/** Live decals; the ring is full of holes as entries expire, so this is a count, not a bound. */
	count = 0;

	/** World position, or the body-space offset from the host's transform. */
	readonly x: Float32Array;
	readonly y: Float32Array;
	readonly halfWidth: Float32Array;
	readonly halfHeight: Float32Array;
	readonly rotation: Float32Array;
	readonly age: Float32Array;
	readonly life: Float32Array;
	/** Host entity for an attached decal, `null` for a world-static one. */
	readonly host: Array<EntityId | null>;
	/** The authored look, or `null` in a free slot. */
	readonly spec: Array<VfxDecalSpec | null>;

	private next = 0;

	constructor(capacity: number = VFX_MAX_DECALS) {
		this.capacity = capacity;
		this.x = new Float32Array(capacity);
		this.y = new Float32Array(capacity);
		this.halfWidth = new Float32Array(capacity);
		this.halfHeight = new Float32Array(capacity);
		this.rotation = new Float32Array(capacity);
		this.age = new Float32Array(capacity);
		this.life = new Float32Array(capacity);
		this.host = Array.from<EntityId | null>({
			length: capacity,
		}).fill(null);
		this.spec = Array.from<VfxDecalSpec | null>({
			length: capacity,
		}).fill(null);
	}

	/**
	 * Write a decal into the next slot, recycling the oldest when the ring is
	 * full.
	 *
	 * `x`/`y` are a world position when `host` is `null` and a body-space offset
	 * from the host's transform otherwise — the caller has just resolved the
	 * impact and knows which it is.
	 */
	add(
		spec: VfxDecalSpec,
		host: EntityId | null,
		x: number,
		y: number,
		rotation: number,
		width: number,
		life: number,
	): void {
		const i = this.next;
		this.next = (i + 1) % this.capacity;
		if (this.spec[i] === null) {
			this.count++;
		}
		this.spec[i] = spec;
		this.host[i] = host;
		this.x[i] = x;
		this.y[i] = y;
		this.rotation[i] = rotation;
		this.halfWidth[i] = width / 2;
		this.halfHeight[i] = (width * spec.aspect) / 2;
		this.age[i] = 0;
		this.life[i] = life;
	}

	/** Free slot `i`. Cheap: the ring never compacts, it only stops drawing. */
	retire(i: number): void {
		if (this.spec[i] === null) {
			return;
		}
		this.spec[i] = null;
		this.host[i] = null;
		this.count--;
	}

	/**
	 * Age every decal by `dt`, retiring the expired ones and those whose host
	 * entity has gone.
	 *
	 * Host presence is polled rather than hooked: a decal's host is any entity
	 * that got hit, so there is no component to hang an `ecs.onDestroy` on, and a
	 * sweep of a few hundred slots once a frame is cheaper than the bookkeeping
	 * would be. Game code that knows a host died before its entity does (a corpse
	 * that lingers) calls {@link clearHost} itself.
	 */
	step(ecs: ReadonlyECS, dt: number): void {
		if (this.count === 0) {
			return;
		}
		for (let i = 0; i < this.capacity; i++) {
			if (this.spec[i] === null) {
				continue;
			}
			const age = this.age[i]! + dt;
			if (age >= this.life[i]!) {
				this.retire(i);
				continue;
			}
			this.age[i] = age;
			const host = this.host[i] ?? null;
			if (
				host !== null &&
				ecs.getComponent(host, TransformComponent) === undefined
			) {
				this.retire(i);
			}
		}
	}

	/**
	 * Drop every decal attached to a host — what death is for, since respawn
	 * reuses entity ids and a surviving smear would reappear on the replacement.
	 */
	clearHost(host: EntityId): void {
		if (this.count === 0) {
			return;
		}
		for (let i = 0; i < this.capacity; i++) {
			if (this.host[i] === host) {
				this.retire(i);
			}
		}
	}
}
