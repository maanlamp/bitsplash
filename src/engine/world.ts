import { PhysicsBodyComponent } from "./components/physics-body";
import { ECS, type EntityId } from "./ecs";
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

	get physicsTime(): number {
		return this.lastPhysicsTime;
	}

	get interpolationAlpha(): number {
		return this.alpha;
	}

	constructor(gravity: Vec, collisionMatrix?: CollisionMatrix) {
		this.physics = new RapierPhysics(gravity, collisionMatrix);
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

	scheduleDespawn(id: EntityId): void {
		setTimeout(() => {
			const phys = this.ecs.getComponent(id, PhysicsBodyComponent);
			if (phys?.body) {
				this.physics.destroyBody(phys.body);
			}
			this.ecs.destroyEntity(id);
		});
	}

	clear(): void {
		for (const [, phys] of this.ecs.query(PhysicsBodyComponent)) {
			if (phys.body) {
				this.physics.destroyBody(phys.body);
			}
		}
		this.ecs.reset();
	}

	step(dt: number): void {
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

	private emitCollisions(): void {
		for (const [a, b] of this.physics.consumeCollisions()) {
			if (a.userData !== null && b.userData !== null) {
				this.events.emit(new CollisionEvent(a.userData, b.userData));
			}
		}
	}
}
