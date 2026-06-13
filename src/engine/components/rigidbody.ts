import { AABB, type Body, Transform } from "planck";
import Vector2 from "../vector2";

/**
 * Wraps the live planck body for an entity, with `Vector2` velocity/impulse
 * helpers. Created via `World.createRigidbody` — the engine's explicit ECS ↔
 * physics bridge — never constructed directly by gameplay.
 */
export class RigidbodyComponent {
	body: Body;
	private cachedHalfExtents: Vector2 | null = null;

	constructor(body: Body) {
		this.body = body;
	}

	get linearVelocity(): Vector2 {
		const v = this.body.getLinearVelocity();
		return new Vector2(v.x, v.y);
	}

	get halfExtents(): Vector2 {
		if (this.cachedHalfExtents) {
			return this.cachedHalfExtents;
		}
		const local = new AABB();
		const fixtureBounds = new AABB();
		const identity = Transform.identity();
		let first = true;
		for (let f = this.body.getFixtureList(); f; f = f.getNext()) {
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

	set linearVelocity(v: Vector2) {
		this.body.setLinearVelocity({ x: v.x, y: v.y });
	}

	applyForce(v: Vector2): void {
		this.body.applyForceToCenter({ x: v.x, y: v.y });
	}

	applyImpulse(v: Vector2): void {
		this.body.applyLinearImpulse(
			{ x: v.x, y: v.y },
			this.body.getWorldCenter(),
		);
	}
}
