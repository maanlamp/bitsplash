import { type Body, Box, Vec2, World as PhysicsWorld } from "planck";
import {
	PhysicsBodyComponent,
	type RigidBodyType,
} from "./components/physics-body";
import { ECS, type EntityId } from "./ecs";
import EventBus from "./events";

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

	setGravity(gravity: Readonly<{ x: number; y: number }>): void {
		this.physics.setGravity(new Vec2(gravity.x, gravity.y));
	}

	createBody(def: RigidbodyDef): Body {
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
		return body;
	}

	despawn(id: EntityId): void {
		const phys = this.ecs.getComponent(id, PhysicsBodyComponent);
		if (phys?.body) {
			this.physics.destroyBody(phys.body);
		}
		this.ecs.destroyEntity(id);
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
		while (this.accumulator >= FIXED_DT) {
			this.physics.step(FIXED_DT);
			this.accumulator -= FIXED_DT;
		}
	}
}
