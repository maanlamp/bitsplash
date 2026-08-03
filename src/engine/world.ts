import type { AudioApi } from "./audio/audio-api";
import {
	type AudioBus,
	type AudioBusSet,
	createBusSetUnder,
} from "./audio/audio-bus";
import { NullAudioBus } from "./audio/null-audio-bus";
import { PhysicsBodyComponent } from "./physics/physics-body-component";
import { ECS } from "./ecs";
import EventBus, { CollisionEvent } from "./events";
import { FrameProfile } from "./profiling/frame-profile";
import type { CollisionMatrix } from "./physics/collision";
import type {
	BodyDef,
	MutableRaycastHit,
	RaycastFilter,
	RaycastHit,
	Vec,
} from "./physics/physics";
import { RapierPhysics } from "./physics/rapier-physics";
import type { RigidBody } from "./physics/rigid-body";

const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;

export type RigidbodyDef = BodyDef;

export class World {
	readonly ecs = new ECS();
	readonly events = new EventBus();
	/** Per-world profiling sink; only fed while {@link setProfiling} is on. */
	readonly profile = new FrameProfile();
	private readonly physics: RapierPhysics;
	private accumulator = 0;
	private alpha = 0;
	private pendingSingleStep = false;
	private disposed = false;
	private profilingEnabled = false;
	private audioRoot: AudioBus = new NullAudioBus();
	private audioBuses: AudioBusSet = createBusSetUnder(this.audioRoot);
	private readonly disposers = new Set<() => void>();

	/**
	 * This world's category buses. Silent until {@link attachAudio}, so a scratch
	 * or probe world makes no sound by construction.
	 *
	 * @example
	 * this.voice = ctx.audio.playLoop(noise, { bus: ctx.world.audio.ambience });
	 */
	get audio(): AudioBusSet {
		return this.audioBuses;
	}

	/**
	 * Hang this world's audio under `parent` — the game bus, or an editor scene
	 * view's bus.
	 *
	 * The world **owns** what this creates and disposes it in {@link dispose}, so
	 * a loop dies with its world by construction rather than by a timeout. That
	 * is what lets sound be world-scoped at all.
	 */
	attachAudio(audio: AudioApi, parent: AudioBus): void {
		this.audioRoot.dispose();
		this.audioRoot = audio.createBus(parent);
		this.audioBuses = audio.createBusSet(this.audioRoot);
	}

	/**
	 * Run `fn` when this world is disposed. Returns a cancel.
	 *
	 * For run-state that lives outside components — a running audio voice, say —
	 * and therefore has nothing else to tie its lifetime to.
	 */
	onDispose(fn: () => void): () => void {
		this.disposers.add(fn);
		return () => {
			this.disposers.delete(fn);
		};
	}

	get interpolationAlpha(): number {
		return this.alpha;
	}

	/**
	 * Enable or disable per-world ECS profiling (default off). The editor turns
	 * this on for the worlds it displays; the bundled game never does.
	 */
	setProfiling(enabled: boolean): void {
		if (this.profilingEnabled === enabled) {
			return;
		}
		this.profilingEnabled = enabled;
		this.ecs.setProfile(enabled ? this.profile : null);
	}

	constructor(gravity: Vec, collisionMatrix?: CollisionMatrix) {
		this.physics = new RapierPhysics(gravity, collisionMatrix);
		this.ecs.onDestroy(PhysicsBodyComponent, (c) => {
			if (c.body) {
				this.physics.destroyBody(c.body);
				c.body = null;
			}
		});
	}

	setGravity(gravity: Vec): void {
		this.physics.setGravity(gravity);
	}

	createBody(def: BodyDef): RigidBody {
		return this.physics.createBody(def);
	}

	createStaticChain(
		points: ReadonlyArray<Vec>,
		friction: number,
		layer?: string,
	): RigidBody {
		return this.physics.createStaticChain(points, friction, layer);
	}

	destroyBody(body: RigidBody): void {
		this.physics.destroyBody(body);
	}

	raycast(
		from: Vec,
		to: Vec,
		filter: RaycastFilter,
	): RaycastHit | null {
		return this.physics.raycast(from, to, filter);
	}

	/**
	 * {@link raycast} into a caller-owned hit, allocating nothing — for loops that
	 * cast per entity per frame. The contact is only valid until the next cast.
	 */
	raycastInto(
		from: Vec,
		to: Vec,
		filter: RaycastFilter,
		out: MutableRaycastHit,
	): boolean {
		return this.physics.raycastInto(from, to, filter, out);
	}

	clear(): void {
		this.ecs.reset();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const fn of this.disposers) {
			fn();
		}
		this.disposers.clear();
		this.audioRoot.dispose();
		this.physics.dispose();
	}

	requestSingleStep(): void {
		this.pendingSingleStep = true;
	}

	step(dt: number): void {
		if (this.pendingSingleStep) {
			this.pendingSingleStep = false;
			this.stepOnce();
			return;
		}
		this.accumulator += Math.min(dt, MAX_FRAME);
		while (this.accumulator >= FIXED_DT) {
			for (const [, phys] of this.ecs.query(PhysicsBodyComponent)) {
				phys.body?.saveSnapshot();
			}
			this.physics.step(FIXED_DT);
			this.accumulator -= FIXED_DT;
			this.emitCollisions();
		}
		this.alpha = this.accumulator / FIXED_DT;
	}

	stepOnce(): void {
		for (const [, phys] of this.ecs.query(PhysicsBodyComponent)) {
			phys.body?.saveSnapshot();
		}
		this.physics.step(FIXED_DT);
		this.accumulator = 0;
		this.alpha = 1;
		this.emitCollisions();
	}

	private emitCollisions(): void {
		for (const [a, b] of this.physics.consumeCollisions()) {
			if (a.userData !== null && b.userData !== null) {
				this.events.emit(new CollisionEvent(a.userData, b.userData));
			}
		}
	}
}
