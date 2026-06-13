import type { EntityId } from "../../engine/ecs";

export class BowComponent {
	owner: EntityId;
	offset: number;
	arrowSpeed: number;
	damage: number;
	spawnDistance: number;
	wasFiring: boolean;

	constructor(
		owner: EntityId,
		offset: number = 10,
		arrowSpeed: number = 360,
		damage: number = 25,
		spawnDistance: number = 8,
	) {
		this.owner = owner;
		this.offset = offset;
		this.arrowSpeed = arrowSpeed;
		this.damage = damage;
		this.spawnDistance = spawnDistance;
		this.wasFiring = false;
	}
}
