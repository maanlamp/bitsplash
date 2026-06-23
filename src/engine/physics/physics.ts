import type { RigidBodyType } from "../components/physics-body";
import type Vector2 from "../vector2";
import type { RigidBody } from "./rigid-body";

export type Vec = Readonly<{ x: number; y: number }>;

export type BodyDef = Readonly<{
	type: RigidBodyType;
	position: Vec;
	fixedRotation?: boolean;
	bullet?: boolean;
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

export type ContactNormal = Readonly<{ normal: Vector2 }>;

export type RaycastFilter = (body: RigidBody) => boolean;

export abstract class Physics {
	abstract setGravity(gravity: Vec): void;
	abstract step(dt: number): void;
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
	abstract touchingContacts(body: RigidBody): Iterable<ContactNormal>;
}
