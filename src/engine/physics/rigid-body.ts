import type { RigidBodyType } from "../physics/physics-body-component";
import type { EntityId } from "../ecs";
import Vector2 from "../vector2";
import type { ContactNormal, Physics, Vec } from "./physics";

export class RigidBody {
	userData: EntityId | null = null;
	private sensorFlag: boolean;
	private readonly previousPosition: Vector2;
	private previousAngle: number;

	constructor(
		readonly native: unknown,
		private readonly physics: Physics,
		readonly halfExtents: Vector2,
		sensor: boolean,
		readonly collisionLayer: string | undefined,
	) {
		this.sensorFlag = sensor;
		this.previousPosition = physics.getPosition(this);
		this.previousAngle = physics.getAngle(this);
	}

	saveSnapshot(): void {
		const p = this.physics.getPosition(this);
		this.previousPosition.set(p.x, p.y);
		this.previousAngle = this.physics.getAngle(this);
	}

	interpolatedPosition(alpha: number): Vector2 {
		const c = this.physics.getPosition(this);
		return new Vector2(
			this.previousPosition.x +
				(c.x - this.previousPosition.x) * alpha,
			this.previousPosition.y +
				(c.y - this.previousPosition.y) * alpha,
		);
	}

	interpolatedAngle(alpha: number): number {
		const c = this.physics.getAngle(this);
		return this.previousAngle + (c - this.previousAngle) * alpha;
	}

	get isSensor(): boolean {
		return this.sensorFlag;
	}

	get isStatic(): boolean {
		return this.physics.isStatic(this);
	}

	get position(): Vector2 {
		return this.physics.getPosition(this);
	}

	get angle(): number {
		return this.physics.getAngle(this);
	}

	set angle(radians: number) {
		this.physics.setTransform(this, this.position, radians);
	}

	setTransform(position: Vec, angle: number): void {
		this.physics.setTransform(this, position, angle);
		this.previousPosition.set(position.x, position.y);
		this.previousAngle = angle;
	}

	get linearVelocity(): Vector2 {
		return this.physics.getLinearVelocity(this);
	}

	set linearVelocity(velocity: Vec) {
		this.physics.setLinearVelocity(this, velocity);
	}

	setAngularVelocity(omega: number): void {
		this.physics.setAngularVelocity(this, omega);
	}

	get mass(): number {
		return this.physics.getMass(this);
	}

	applyForce(force: Vec): void {
		this.physics.applyForce(this, force);
	}

	applyImpulse(impulse: Vec): void {
		this.physics.applyImpulse(this, impulse);
	}

	setBodyType(type: RigidBodyType): void {
		this.physics.setBodyType(this, type);
	}

	setAwake(awake: boolean): void {
		this.physics.setAwake(this, awake);
	}

	setSensor(sensor: boolean): void {
		if (sensor !== this.sensorFlag) {
			this.sensorFlag = sensor;
			this.physics.setSensor(this, sensor);
		}
	}

	touchingContacts(): Iterable<ContactNormal> {
		return this.physics.touchingContacts(this);
	}
}
