import type { RigidBody } from "../physics/rigid-body";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type Vector2 from "../vector2";

export const RIGID_BODY_TYPES = [
	"static",
	"dynamic",
	"kinematic",
] as const;

export type RigidBodyType = (typeof RIGID_BODY_TYPES)[number];

@serializable("PhysicsBody")
export class PhysicsBodyComponent {
	@serialize({ options: RIGID_BODY_TYPES })
	type: RigidBodyType;
	@serialize() halfWidth: number;
	@serialize() halfHeight: number;
	@serialize() density: number;
	@serialize() friction: number;
	@serialize() restitution: number;
	@serialize() fixedRotation: boolean;
	@serialize() linearDamping: number;
	@serialize() collisionLayer: string;
	@serialize() sensor: boolean;
	@serialize() offsetX: number;
	@serialize() offsetY: number;
	@serialize() cornerRadius: number;

	body: RigidBody | null = null;

	constructor(
		type: RigidBodyType = "dynamic",
		halfWidth: number = 8,
		halfHeight: number = 8,
		density: number = 1,
		friction: number = 0,
		restitution: number = 0,
		fixedRotation: boolean = true,
		linearDamping: number = 0,
		collisionLayer: string = "default",
		sensor: boolean = false,
		offsetX: number = 0,
		offsetY: number = 0,
		cornerRadius: number = 0,
	) {
		this.type = type;
		this.halfWidth = halfWidth;
		this.halfHeight = halfHeight;
		this.density = density;
		this.friction = friction;
		this.restitution = restitution;
		this.fixedRotation = fixedRotation;
		this.linearDamping = linearDamping;
		this.collisionLayer = collisionLayer;
		this.sensor = sensor;
		this.offsetX = offsetX;
		this.offsetY = offsetY;
		this.cornerRadius = cornerRadius;
	}

	get linearVelocity(): Vector2 {
		return this.body!.linearVelocity;
	}

	set linearVelocity(v: Vector2) {
		this.body!.linearVelocity = v;
	}

	get halfExtents(): Vector2 {
		return this.body!.halfExtents;
	}

	applyForce(v: Vector2): void {
		this.body!.applyForce(v);
	}

	applyImpulse(v: Vector2): void {
		this.body!.applyImpulse(v);
	}
}
