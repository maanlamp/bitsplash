import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { RIGID_BODY_TYPES, type RigidBodyType } from "../world";

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
}
