import { AABB, type Body, Transform } from "planck";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import Vector2 from "../vector2";

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
	@serialize() bullet: boolean;
	@serialize() linearDamping: number;
	@serialize() filterGroupIndex: number;
	@serialize() filterCategoryBits: number;
	@serialize() filterMaskBits: number;
	@serialize() sensor: boolean;
	@serialize() offsetX: number;
	@serialize() offsetY: number;

	body: Body | null = null;
	private cachedHalfExtents: Vector2 | null = null;

	constructor(
		type: RigidBodyType = "dynamic",
		halfWidth: number = 8,
		halfHeight: number = 8,
		density: number = 1,
		friction: number = 0,
		restitution: number = 0,
		fixedRotation: boolean = true,
		bullet: boolean = false,
		linearDamping: number = 0,
		filterGroupIndex: number = 0,
		filterCategoryBits: number = 1,
		filterMaskBits: number = 0xffff,
		sensor: boolean = false,
		offsetX: number = 0,
		offsetY: number = 0,
	) {
		this.type = type;
		this.halfWidth = halfWidth;
		this.halfHeight = halfHeight;
		this.density = density;
		this.friction = friction;
		this.restitution = restitution;
		this.fixedRotation = fixedRotation;
		this.bullet = bullet;
		this.linearDamping = linearDamping;
		this.filterGroupIndex = filterGroupIndex;
		this.filterCategoryBits = filterCategoryBits;
		this.filterMaskBits = filterMaskBits;
		this.sensor = sensor;
		this.offsetX = offsetX;
		this.offsetY = offsetY;
	}

	get linearVelocity(): Vector2 {
		const v = this.body!.getLinearVelocity();
		return new Vector2(v.x, v.y);
	}

	set linearVelocity(v: Vector2) {
		this.body!.setLinearVelocity({ x: v.x, y: v.y });
	}

	get halfExtents(): Vector2 {
		if (this.cachedHalfExtents) {
			return this.cachedHalfExtents;
		}
		const local = new AABB();
		const fixtureBounds = new AABB();
		const identity = Transform.identity();
		let first = true;
		for (let f = this.body!.getFixtureList(); f; f = f.getNext()) {
			f.getShape().computeAABB(fixtureBounds, identity, 0);
			if (first) {
				local.set(fixtureBounds);
				first = false;
			} else {
				local.combine(local, fixtureBounds);
			}
		}
		const e = local.getExtents();
		this.cachedHalfExtents = new Vector2(e.x, e.y);
		return this.cachedHalfExtents;
	}

	applyForce(v: Vector2): void {
		this.body!.applyForceToCenter({ x: v.x, y: v.y });
	}

	applyImpulse(v: Vector2): void {
		this.body!.applyLinearImpulse(
			{ x: v.x, y: v.y },
			this.body!.getWorldCenter(),
		);
	}
}
