import { Component } from "lib/game";
import { PhysicsObject } from "lib/physics";
import { Mutable } from "lib/utils";
import { Vector2 } from "lib/vector";

export const gravity: Component<PhysicsObject> =
	game => (self, context, delta) => {
		if (self.static) return;

		(self.force as Mutable<Vector2>)[1] += self.mass * game.world.gravity;
	};
