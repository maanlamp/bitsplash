import type { RigidBodyType } from "../physics/physics-body-component";
import type Vector2 from "../vector2";
import type { RigidBody } from "./rigid-body";

export type Vec = Readonly<{ x: number; y: number }>;

export type BodyDef = Readonly<{
	type: RigidBodyType;
	position: Vec;
	fixedRotation?: boolean;
	linearDamping?: number;
	box: Readonly<{
		halfWidth: number;
		halfHeight: number;
		offsetX?: number;
		offsetY?: number;
		cornerRadius?: number;
	}>;
	density?: number;
	friction?: number;
	restitution?: number;
	collisionLayer?: string;
	sensor?: boolean;
}>;

export type CollisionPair = readonly [RigidBody, RigidBody];

export type RaycastHit = Readonly<{
	point: Vector2;
	normal: Vector2;
	body: RigidBody;
}>;

/**
 * A {@link RaycastHit} the caller owns and the cast writes into.
 *
 * `raycast` allocates its hit, which is right for the once-an-event casts — an
 * arrow landing, a line of sight — and wrong for a loop casting per particle
 * per frame. Such a caller keeps one of these as an instance field and reads it
 * out before the next cast; `body` is only meaningful when
 * {@link Physics.raycastInto} returned `true`.
 */
export type MutableRaycastHit = {
	point: Vector2;
	normal: Vector2;
	body: RigidBody | null;
};

export type RaycastFilter = (body: RigidBody) => boolean;

export abstract class Physics {
	abstract setGravity(gravity: Vec): void;
	abstract step(dt: number): void;
	abstract dispose(): void;
	abstract createBody(def: BodyDef): RigidBody;
	abstract createStaticChain(
		points: ReadonlyArray<Vec>,
		friction: number,
		layer?: string,
	): RigidBody;
	abstract destroyBody(body: RigidBody): void;
	abstract consumeCollisions(): ReadonlyArray<CollisionPair>;
	abstract raycast(
		from: Vec,
		to: Vec,
		filter: RaycastFilter,
	): RaycastHit | null;

	/**
	 * {@link raycast} into a caller-owned hit, allocating nothing.
	 *
	 * Same cast, same filter, same result — it just writes the contact into `out`
	 * and reports whether there was one. Anything retaining the point past the
	 * call must copy it: the next cast overwrites it.
	 */
	abstract raycastInto(
		from: Vec,
		to: Vec,
		filter: RaycastFilter,
		out: MutableRaycastHit,
	): boolean;

	abstract getPosition(body: RigidBody): Vector2;
	abstract getAngle(body: RigidBody): number;
	abstract setTransform(
		body: RigidBody,
		position: Vec,
		angle: number,
	): void;
	abstract getLinearVelocity(body: RigidBody): Vector2;
	abstract setLinearVelocity(body: RigidBody, velocity: Vec): void;
	abstract setAngularVelocity(body: RigidBody, omega: number): void;
	abstract getMass(body: RigidBody): number;
	abstract applyForce(body: RigidBody, force: Vec): void;
	abstract applyImpulse(body: RigidBody, impulse: Vec): void;
	abstract setBodyType(body: RigidBody, type: RigidBodyType): void;
	abstract setAwake(body: RigidBody, awake: boolean): void;
	abstract isStatic(body: RigidBody): boolean;
	abstract setSensor(body: RigidBody, sensor: boolean): void;
	/**
	 * Whether any contact on `body` has a normal pointing within `minDot` of the
	 * direction `dirX`, `dirY` — a cone test, with `minDot` the cosine of its
	 * half-angle.
	 *
	 * Every caller asks the same shape of question ("am I standing on
	 * something", "is there a wall to my right") and only needs a yes or no, so
	 * the predicate is answered inside the physics backend. Handing out a normal
	 * per contact instead meant a vector and a wrapper per contact, per body,
	 * per frame, and every caller then wrote the same comparison loop.
	 *
	 * `dirX`, `dirY` must be unit length.
	 *
	 * @example
	 * const grounded = physics.hasContactNormal(body, 0, 1, 0.5);
	 */
	abstract hasContactNormal(
		body: RigidBody,
		dirX: number,
		dirY: number,
		minDot: number,
	): boolean;
}
