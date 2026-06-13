import { options } from "../serialization/field-enums";
import { serializable } from "../serialization/serializable";
import { RIGID_BODY_TYPES, type RigidBodyType } from "../world";

export type PhysicsBodyDef = Readonly<{
	type: RigidBodyType;
	halfWidth: number;
	halfHeight: number;
	density: number;
	friction: number;
	restitution: number;
	fixedRotation: boolean;
	bullet: boolean;
	linearDamping: number;
	filterGroupIndex: number;
	filterCategoryBits: number;
	filterMaskBits: number;
	sensor: boolean;
	offsetX: number;
	offsetY: number;
}>;

const DEFAULT_PHYSICS_BODY: PhysicsBodyDef = {
	type: "dynamic",
	halfWidth: 8,
	halfHeight: 8,
	density: 1,
	friction: 0,
	restitution: 0,
	fixedRotation: true,
	bullet: false,
	linearDamping: 0,
	filterGroupIndex: 0,
	filterCategoryBits: 1,
	filterMaskBits: 0xffff,
	sensor: false,
	offsetX: 0,
	offsetY: 0,
};

@serializable("PhysicsBody")
export class PhysicsBodyComponent {
	@options(RIGID_BODY_TYPES)
	type: RigidBodyType;
	halfWidth: number;
	halfHeight: number;
	density: number;
	friction: number;
	restitution: number;
	fixedRotation: boolean;
	bullet: boolean;
	linearDamping: number;
	filterGroupIndex: number;
	filterCategoryBits: number;
	filterMaskBits: number;
	sensor: boolean;
	offsetX: number;
	offsetY: number;

	constructor(def: PhysicsBodyDef = DEFAULT_PHYSICS_BODY) {
		this.type = def.type;
		this.halfWidth = def.halfWidth;
		this.halfHeight = def.halfHeight;
		this.density = def.density;
		this.friction = def.friction;
		this.restitution = def.restitution;
		this.fixedRotation = def.fixedRotation;
		this.bullet = def.bullet;
		this.linearDamping = def.linearDamping;
		this.filterGroupIndex = def.filterGroupIndex;
		this.filterCategoryBits = def.filterCategoryBits;
		this.filterMaskBits = def.filterMaskBits;
		this.sensor = def.sensor;
		this.offsetX = def.offsetX;
		this.offsetY = def.offsetY;
	}
}
