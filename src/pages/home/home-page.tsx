import Canvas from "components/canvas/canvas";
import {
	delegatePhysics,
	PhysicsObject,
	TPhysicsObject,
	TWorld,
} from "lib/physics";
import Entity from "models/entity";
import Renderable from "models/renderable";

const ground1: Entity & Renderable & TPhysicsObject = {
	...PhysicsObject({
		x: 0,
		y: 100,
		w: 300,
		h: 10,
		immovable: true,
	}),
	update: () => {},
	render: (context, delta) => {
		context.fillStyle = "#e9e9ec";
		context.strokeStyle = "#535353";
		context.fillRect(ground1.x, ground1.y, ground1.w, ground1.h);
		context.strokeRect(ground1.x, ground1.y, ground1.w, ground1.h);
	},
};

const ground2: Entity & Renderable & TPhysicsObject = {
	...PhysicsObject({
		x: 50,
		y: 150,
		w: 300,
		h: 10,
		immovable: true,
	}),
	update: () => {},
	render: (context, delta) => {
		context.fillStyle = "#e9e9ec";
		context.strokeStyle = "#535353";
		context.fillRect(ground2.x, ground2.y, ground2.w, ground2.h);
		context.strokeRect(ground2.x, ground2.y, ground2.w, ground2.h);
	},
};

const world: TWorld = {
	gravity: 0.02,
	drag: 0.5,
};

const entities: (Entity & Renderable & TPhysicsObject)[] = [];

let UP = 0;
let RIGHT = 0;
let DOWN = 0;
let LEFT = 0;
window.addEventListener("keydown", ({ key, repeat }) => {
	switch (key.toLowerCase()) {
		case "a":
			LEFT = 1;
			break;
		case "d":
			RIGHT = 1;
			break;
		case " ":
			UP = 1;
			break;
	}
});
window.addEventListener("keyup", ({ key }) => {
	switch (key.toLowerCase()) {
		case "a":
			LEFT = 0;
			break;
		case "d":
			RIGHT = 0;
			break;
		case " ":
			UP = 0;
			break;
	}
});

const player: Entity & Renderable & TPhysicsObject = {
	...PhysicsObject({
		w: 16,
		h: 16,
		restitution: 0.3,
	}),
	update: (context, delta: number) => {
		delegatePhysics(
			player,
			entities.filter(p => p !== player),
			delta,
			world
		);
		player.vx -= LEFT * 0.01;
		player.vx += RIGHT * 0.01;
		if (UP) {
			player.vy = UP * -0.25;
		}
	},
	render: (context, delta) => {
		context.strokeStyle = "#535353";
		context.fillStyle = "red";
		context.lineWidth = 1;
		const warpedHeight = player.h + player.h * Math.abs(player.vy) * 3;
		context.fillRect(
			player.x,
			player.y - warpedHeight * Math.abs(player.vy),
			player.w,
			warpedHeight
		);
		context.strokeRect(
			player.x,
			player.y - warpedHeight * Math.abs(player.vy),
			player.w,
			warpedHeight
		);
		context.strokeStyle = "lime";
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(
			player.x + player.w / 2,
			player.y + warpedHeight / 2 - warpedHeight * Math.abs(player.vy)
		);
		context.lineTo(
			player.x + player.w / 2 + player.vx * 250,
			player.y +
				warpedHeight / 2 +
				player.vy * 250 -
				warpedHeight * Math.abs(player.vy)
		);
		context.stroke();
	},
};

entities.push(ground1);
entities.push(ground2);
entities.push(player);

const HomePage = () => {
	return <Canvas entities={entities} />;
};

export default HomePage;
