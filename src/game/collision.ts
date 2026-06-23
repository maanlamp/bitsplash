import {
	CollisionMatrix,
	type CollisionRelation,
} from "../engine/physics/collision";

export const Layer = {
	Terrain: "terrain",
	Player: "player",
	Enemy: "enemy",
	Npc: "npc",
	Projectile: "projectile",
	Pickup: "pickup",
	Crate: "crate",
} as const;

const LAYERS = Object.values(Layer);

const pair = (a: string, b: string): string =>
	[a, b].sort().join(" ");

const BLOCK = new Set(
	[
		[Layer.Terrain, Layer.Player],
		[Layer.Terrain, Layer.Enemy],
		[Layer.Terrain, Layer.Npc],
		[Layer.Terrain, Layer.Pickup],
		[Layer.Terrain, Layer.Crate],
		[Layer.Crate, Layer.Player],
		[Layer.Crate, Layer.Enemy],
		[Layer.Crate, Layer.Npc],
		[Layer.Crate, Layer.Pickup],
		[Layer.Crate, Layer.Crate],
	].map(([a, b]) => pair(a!, b!)),
);

const DETECT = new Set(
	[
		[Layer.Player, Layer.Enemy],
		[Layer.Player, Layer.Pickup],
	].map(([a, b]) => pair(a!, b!)),
);

const relation = (a: string, b: string): CollisionRelation => {
	const key = pair(a, b);
	if (BLOCK.has(key)) {
		return "block";
	}
	if (DETECT.has(key)) {
		return "detect";
	}
	return "ignore";
};

export const collisionMatrix = new CollisionMatrix(LAYERS, relation);
