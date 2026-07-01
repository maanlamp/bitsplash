import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { RigidBodyType } from "../physics/physics-body-component";
import { TILE_SIZE } from "../tilemap/tile";
import Vector2 from "../vector2";
import type { CollisionMatrix } from "./collision";
import type {
	BodyDef,
	CollisionPair,
	ContactNormal,
	RaycastFilter,
	RaycastHit,
	Vec,
} from "./physics";
import { Physics } from "./physics";
import { RigidBody } from "./rigid-body";

type Rapier = typeof RAPIER_NS;

let RAPIER: Rapier | null = null;

export const loadRapier = async (): Promise<void> => {
	if (!RAPIER) {
		RAPIER = await import("@dimforge/rapier2d");
	}
};

type Native = Readonly<{
	body: RAPIER_NS.RigidBody;
	collider: RAPIER_NS.Collider;
}>;

const handle = (body: RigidBody): Native => body.native as Native;

export class RapierPhysics extends Physics {
	private readonly r: Rapier;
	private readonly world: RAPIER_NS.World;
	private readonly matrix?: CollisionMatrix;
	private readonly queue: RAPIER_NS.EventQueue;
	private collisions: CollisionPair[] = [];

	constructor(gravity: Vec, matrix?: CollisionMatrix) {
		super();
		if (!RAPIER) {
			throw new Error(
				"loadRapier() must be awaited before constructing RapierPhysics",
			);
		}
		this.r = RAPIER;
		this.matrix = matrix;
		this.world = new this.r.World({ x: gravity.x, y: gravity.y });
		this.world.lengthUnit = TILE_SIZE;
		this.queue = new this.r.EventQueue(true);
	}

	setGravity(gravity: Vec): void {
		this.world.gravity = { x: gravity.x, y: gravity.y };
	}

	step(dt: number): void {
		this.world.timestep = dt;
		this.collisions = [];
		this.world.step(this.queue);
		this.queue.drainCollisionEvents((h1, h2, started) => {
			if (!started) {
				return;
			}
			const a = this.world.getCollider(h1)?.parent()?.userData as
				| RigidBody
				| undefined;
			const b = this.world.getCollider(h2)?.parent()?.userData as
				| RigidBody
				| undefined;
			if (a && b) {
				this.collisions.push([a, b]);
			}
		});
	}

	consumeCollisions(): ReadonlyArray<CollisionPair> {
		return this.collisions;
	}

	createBody(def: BodyDef): RigidBody {
		const desc = this.bodyDesc(def.type)
			.setTranslation(def.position.x, def.position.y)
			.setLinearDamping(def.linearDamping ?? 0)
			.setCcdEnabled(def.type === "dynamic");
		if (def.fixedRotation ?? false) {
			desc.lockRotations();
		}
		const body = this.world.createRigidBody(desc);

		const sensor = def.sensor ?? false;
		const groups = this.matrix?.groups(def.collisionLayer);
		const colliderDesc = this.boxShape(def.box)
			.setTranslation(def.box.offsetX ?? 0, def.box.offsetY ?? 0)
			.setDensity(def.density ?? 1)
			.setFriction(def.friction ?? 0)
			.setFrictionCombineRule(this.r.CoefficientCombineRule.Min)
			.setRestitution(def.restitution ?? 0)
			.setSensor(sensor)
			.setActiveEvents(this.r.ActiveEvents.COLLISION_EVENTS);
		if (groups) {
			colliderDesc
				.setCollisionGroups(groups.collisionGroups)
				.setSolverGroups(groups.solverGroups);
		}
		const collider = this.world.createCollider(colliderDesc, body);

		const rigidBody = new RigidBody(
			{ body, collider },
			this,
			new Vector2(def.box.halfWidth, def.box.halfHeight),
			sensor,
			def.collisionLayer,
		);
		body.userData = rigidBody;
		return rigidBody;
	}

	private boxShape(box: BodyDef["box"]): RAPIER_NS.ColliderDesc {
		const radius = box.cornerRadius ?? 0;
		const hx = box.halfWidth;
		const hy = box.halfHeight;
		if (radius > 0 && radius < hx && radius < hy) {
			return this.r.ColliderDesc.roundCuboid(
				hx - radius,
				hy - radius,
				radius,
			);
		}
		return this.r.ColliderDesc.cuboid(hx, hy);
	}

	private bodyDesc(type: RigidBodyType): RAPIER_NS.RigidBodyDesc {
		if (type === "static") {
			return this.r.RigidBodyDesc.fixed();
		}
		if (type === "kinematic") {
			return this.r.RigidBodyDesc.kinematicVelocityBased();
		}
		return this.r.RigidBodyDesc.dynamic();
	}

	createStaticChain(
		points: ReadonlyArray<Vec>,
		friction: number,
		layer?: string,
	): RigidBody {
		const body = this.world.createRigidBody(
			this.r.RigidBodyDesc.fixed(),
		);
		const verts = new Float32Array((points.length + 1) * 2);
		points.forEach((p, i) => {
			verts[i * 2] = p.x;
			verts[i * 2 + 1] = p.y;
		});
		verts[points.length * 2] = points[0]!.x;
		verts[points.length * 2 + 1] = points[0]!.y;
		const colliderDesc = this.r.ColliderDesc.polyline(verts)
			.setFriction(friction)
			.setFrictionCombineRule(this.r.CoefficientCombineRule.Min)
			.setActiveEvents(this.r.ActiveEvents.COLLISION_EVENTS);
		const groups = this.matrix?.groups(layer);
		if (groups) {
			colliderDesc
				.setCollisionGroups(groups.collisionGroups)
				.setSolverGroups(groups.solverGroups);
		}
		const collider = this.world.createCollider(colliderDesc, body);
		const rigidBody = new RigidBody(
			{ body, collider },
			this,
			new Vector2(0, 0),
			false,
			layer,
		);
		body.userData = rigidBody;
		return rigidBody;
	}

	destroyBody(body: RigidBody): void {
		this.world.removeRigidBody(handle(body).body);
	}

	raycast(
		from: Vec,
		to: Vec,
		filter: RaycastFilter,
	): RaycastHit | null {
		const dir = { x: to.x - from.x, y: to.y - from.y };
		const ray = new this.r.Ray({ x: from.x, y: from.y }, dir);
		const hit = this.world.castRayAndGetNormal(
			ray,
			1,
			true,
			undefined,
			undefined,
			undefined,
			undefined,
			(collider) => {
				const body = collider.parent()?.userData as
					| RigidBody
					| undefined;
				return body ? filter(body) : false;
			},
		);
		if (!hit) {
			return null;
		}
		const body = hit.collider.parent()?.userData as
			| RigidBody
			| undefined;
		if (!body) {
			return null;
		}
		const point = ray.pointAt(hit.timeOfImpact);
		return {
			point: new Vector2(point.x, point.y),
			normal: new Vector2(hit.normal.x, hit.normal.y),
			body,
		};
	}

	getPosition(body: RigidBody): Vector2 {
		const t = handle(body).body.translation();
		return new Vector2(t.x, t.y);
	}

	getAngle(body: RigidBody): number {
		return handle(body).body.rotation();
	}

	setTransform(body: RigidBody, position: Vec, angle: number): void {
		const b = handle(body).body;
		b.setTranslation({ x: position.x, y: position.y }, true);
		b.setRotation(angle, true);
	}

	getLinearVelocity(body: RigidBody): Vector2 {
		const v = handle(body).body.linvel();
		return new Vector2(v.x, v.y);
	}

	setLinearVelocity(body: RigidBody, velocity: Vec): void {
		handle(body).body.setLinvel(
			{ x: velocity.x, y: velocity.y },
			true,
		);
	}

	setAngularVelocity(body: RigidBody, omega: number): void {
		handle(body).body.setAngvel(omega, true);
	}

	getMass(body: RigidBody): number {
		return handle(body).body.mass();
	}

	applyForce(body: RigidBody, force: Vec): void {
		handle(body).body.addForce({ x: force.x, y: force.y }, true);
	}

	applyImpulse(body: RigidBody, impulse: Vec): void {
		handle(body).body.applyImpulse(
			{ x: impulse.x, y: impulse.y },
			true,
		);
	}

	setBodyType(body: RigidBody, type: RigidBodyType): void {
		const t =
			type === "static"
				? this.r.RigidBodyType.Fixed
				: type === "kinematic"
					? this.r.RigidBodyType.KinematicVelocityBased
					: this.r.RigidBodyType.Dynamic;
		handle(body).body.setBodyType(t, true);
	}

	setAwake(body: RigidBody, awake: boolean): void {
		const b = handle(body).body;
		if (awake) {
			b.wakeUp();
		} else {
			b.sleep();
		}
	}

	isStatic(body: RigidBody): boolean {
		return handle(body).body.isFixed();
	}

	setSensor(body: RigidBody, sensor: boolean): void {
		handle(body).collider.setSensor(sensor);
	}

	*touchingContacts(body: RigidBody): Iterable<ContactNormal> {
		const { collider } = handle(body);
		const found: ContactNormal[] = [];
		this.world.contactPairsWith(collider, (other) => {
			this.world.contactPair(collider, other, (manifold, flipped) => {
				if (manifold.numContacts() === 0) {
					return;
				}
				const n = manifold.normal();
				found.push({
					normal: new Vector2(
						flipped ? -n.x : n.x,
						flipped ? -n.y : n.y,
					),
				});
			});
		});
		yield* found;
	}
}
