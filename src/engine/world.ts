import { Box, World as PhysicsWorld } from "planck";
import { RigidbodyComponent } from "./components/rigidbody";
import { ECS, type EntityId } from "./ecs";
import EventBus from "./events";

export const RIGID_BODY_TYPES = [
	"static",
	"dynamic",
	"kinematic",
] as const;

export type RigidBodyType = (typeof RIGID_BODY_TYPES)[number];

const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;

export type RigidbodyDef = Readonly<{
	type: RigidBodyType;
	position: Readonly<{ x: number; y: number }>;
	fixedRotation?: boolean;
	bullet?: boolean;
	linearDamping?: number;
	box: Readonly<{
		halfWidth: number;
		halfHeight: number;
		offsetX?: number;
		offsetY?: number;
	}>;
	density?: number;
	friction?: number;
	restitution?: number;
	filterGroupIndex?: number;
	filterCategoryBits?: number;
	filterMaskBits?: number;
	sensor?: boolean;
}>;

export class World {
	readonly ecs = new ECS();
	readonly events = new EventBus();
	readonly physics: PhysicsWorld;
	private accumulator = 0;

	constructor(gravity: Readonly<{ x: number; y: number }>) {
		this.physics = new PhysicsWorld({ gravity });
	}

	createRigidbody(def: RigidbodyDef): RigidbodyComponent {
		const body = this.physics.createBody({
			type: def.type,
			position: { x: def.position.x, y: def.position.y },
			fixedRotation: def.fixedRotation ?? false,
			bullet: def.bullet ?? false,
			linearDamping: def.linearDamping ?? 0,
		});
		body.createFixture({
			shape: new Box(def.box.halfWidth, def.box.halfHeight, {
				x: def.box.offsetX ?? 0,
				y: def.box.offsetY ?? 0,
			}),
			density: def.density ?? 1,
			friction: def.friction ?? 0,
			restitution: def.restitution ?? 0,
			filterGroupIndex: def.filterGroupIndex ?? 0,
			filterCategoryBits: def.filterCategoryBits ?? 1,
			filterMaskBits: def.filterMaskBits ?? 0xffff,
			isSensor: def.sensor ?? false,
		});
		return new RigidbodyComponent(body);
	}

	despawn(id: EntityId): void {
		const rigidbody = this.ecs.getComponent(id, RigidbodyComponent);
		if (rigidbody) {
			this.physics.destroyBody(rigidbody.body);
		}
		this.ecs.destroyEntity(id);
	}

	/**
	 * Destroys every physics body, then nukes the ECS. Bodies must be torn down
	 * here first — `ecs.reset()` alone would leak them in the planck world.
	 */
	clear(): void {
		for (const [, rigidbody] of this.ecs.query(RigidbodyComponent)) {
			this.physics.destroyBody(rigidbody.body);
		}
		this.ecs.reset();
	}

	step(dt: number): void {
		this.accumulator += Math.min(dt, MAX_FRAME);
		while (this.accumulator >= FIXED_DT) {
			this.physics.step(FIXED_DT);
			this.accumulator -= FIXED_DT;
		}
	}
}
