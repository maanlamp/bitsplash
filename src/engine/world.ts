import { PhysicsBodyComponent } from "./physics/physics-body-component";
import { ECS } from "./ecs";
import EventBus, { CollisionEvent } from "./events";
import type { CollisionMatrix } from "./physics/collision";
import type {
	BodyDef,
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
	private readonly physics: RapierPhysics;
	private accumulator = 0;
	private lastPhysicsTime = 0;
	private alpha = 0;
	private pendingSingleStep = false;
	private disposed = false;

	get physicsTime(): number {
		return this.lastPhysicsTime;
	}

	get interpolationAlpha(): number {
		return this.alpha;
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

	clear(): void {
		this.ecs.reset();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
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
		let stepTime = 0;
		while (this.accumulator >= FIXED_DT) {
			for (const [, phys] of this.ecs.query(PhysicsBodyComponent)) {
				phys.body?.saveSnapshot();
			}
			const before = performance.now();
			this.physics.step(FIXED_DT);
			stepTime += performance.now() - before;
			this.accumulator -= FIXED_DT;
			this.emitCollisions();
		}
		this.lastPhysicsTime = stepTime;
		this.alpha = this.accumulator / FIXED_DT;
	}

	stepOnce(): void {
		for (const [, phys] of this.ecs.query(PhysicsBodyComponent)) {
			phys.body?.saveSnapshot();
		}
		const before = performance.now();
		this.physics.step(FIXED_DT);
		this.lastPhysicsTime = performance.now() - before;
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
