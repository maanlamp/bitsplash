import shipSrc from "./assets/ship.png";
import Game from "./core/game";
import { ElementNode, MarkupNode, program, run } from "./core/markup";
import { paint } from "./core/paint";
import * as Vector2 from "./core/vector2";

const clear = (node: Element) => {
	while (node.lastChild) node.lastChild.remove();
	return node;
};

const input = document.createElement("textarea");
input.id = "input";
const output = document.createElement("div");
output.id = "output";
const raw = document.createElement("pre");
raw.id = "raw";
const rendered = document.createElement("div");
rendered.id = "rendered";
const style = document.createElement("style");
output.append(rendered, raw);

style.textContent = `
html, body {
	display: flex;
	width: 100vw;
	height: 100vh;
	flex-direction: column;
	font-size: 20px;
	tab-size: 2;
}

#input, #output, #raw, #rendered {
	display: flex;
	flex-grow: 1;
}

#input {
	resize: none;
	font: inherit;
	font-family: "Fira Code";
	padding: 1rem;
}

#output {
	height: 40%;
}

#output>* {
	width: 50%;
}

#rendered {
	align-items: center;
	justify-content: center;
	background-image: linear-gradient(45deg, #00000007 25%, transparent 25%), linear-gradient(-45deg, #00000007 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #00000007 75%), linear-gradient(-45deg, transparent 75%, #00000007 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

#raw {
	font-family: "Fira Code";
	overflow: auto;

	&.error {
		background: red;
		color: yellow;
		padding: 1rem;
		display: flex;
	}
}
`.trim();
document.head.append(style);

let parsed: MarkupNode;
const update = () => {
	try {
		parsed = run(program)(input.value);
		raw.classList.remove("error");
		clear(raw).append(JSON.stringify(parsed, null, 2));
	} catch (error: any) {
		clear(raw).append(error.stack);
		raw.classList.add("error");
	}
};

input.textContent = `
<game>
	<viewport hover="4px orange">
		<column hover="2px red">
			<row hover="2px green">
				<column
					hover="2px blue"
					click="white"
					fill="grey"
					color="white"
					radius={16}
					padding={32}
					gap={8}
					alignCross="end">
					<box fill="red">Lorem</box>
					<box fill="green">Ipsum</box>
					<box fill="blue">dolor</box>
				</column>
				<row
					hover="2px yellow"
					click="white"
					fill="rgb(150,150,150)"
					color="black"
					radius={5}
					padding={32}
					alignCross="center"
					gap={16}>
					<box fill="cyan">sit</box>
					<box fill="magenta">amet</box>
					<box fill="yellow">consectetur</box>
				</row>
			</row>
			<column
				hover="2px cyan"
				click="white"
				fill="rgb(220,220,220)"
				color="white"
				radius={5}
				padding={8}
				alignCross="end">
				<box cursor="text" fill="orange" color="blue">Lorem</box>
				<box cursor="text" fill="teal">Ipsum</box>
				<box cursor="text" fill="purple">dolor</box>
				<canvas cursor="pointer" painter={
					(context, pos, size) => {
						context.fillStyle = "hsl(" + (performance.now() / 30 % 360)  + "deg,100%,50%)";
						context.fillRect(pos.x,pos.y,size.w,size.h);
					}
				}/>
				<grid width={100} columns="auto" gap={4} fill="white" color="black">
					{[...Array(28)].map((_,i) => i)}
				</grid>
				<grid columns="4" gap={4} fill="yellow" color="black">
					{[...Array(28)].map((_,i) => i)}
				</grid>
				<grid columns={4}>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
					<image url="${shipSrc}"/>
				</grid>
			</column>
		</column>
	</viewport>
</game>
`.trim();

(input as any).addEventListener("input", update);
document.body.append(output, input);
update();

// ECS

const game = Game();
game.renderer.attach(rendered);

const shipImg = new Image();
shipImg.src = shipSrc;
const Drawable = () => ({
	img: shipImg,
	offsetX: 0,
	offsetY: -16,
});

const Location = () => ({
	angle: 0,
	x: game.renderer.viewport.width / 2,
	y: game.renderer.viewport.height / 2,
});

const Physics = () => ({
	force: [0, 0],
	mass: 1,
	drag: 0.005,
	acceleration: 0.005,
});

const Keys = () => game.input.keyboard;
const Gamepad = () => game.input.gamepads;
const Mouse = () => game.input.mouse;

const playerId = game.entities.create([
	Location,
	Drawable,
	Keys,
	Gamepad,
	Physics,
]);

const ensureVisibleSystem = game.systems.create([Location], e => {
	if (e.Location.x > game.renderer.viewport.width) {
		e.Location.x = 0;
	} else if (e.Location.x < 0) {
		e.Location.x = game.renderer.viewport.width;
	}
	if (e.Location.y > game.renderer.viewport.height) {
		e.Location.y = 0;
	} else if (e.Location.y < 0) {
		e.Location.y = game.renderer.viewport.height;
	}
});

const drawingSystem = game.systems.create([Location, Drawable], e => {
	const c = game.renderer.context;
	c.save();
	c.translate(e.Location.x, e.Location.y);
	c.rotate(Vector2.deg2rad(e.Location.angle));
	c.drawImage(
		e.Drawable.img,
		-(e.Drawable.img.width / 2) + e.Drawable.offsetX,
		-(e.Drawable.img.height / 2) + e.Drawable.offsetY
	);
	c.restore();
});

const keyboardMovementSystem = game.systems.create(
	[Keys, Location, Physics],
	(e, delta) => {
		if (e.Keys.A) {
			e.Location.angle -= 3;
		}
		if (e.Keys.D) {
			e.Location.angle += 3;
		}

		let distance: Vector2.Vector2 = [0, 0];
		if (e.Keys.W) {
			distance = Vector2.lenDir(
				e.Physics.acceleration * delta,
				e.Location.angle - 90
			);
		}
		if (e.Keys.S) {
			distance = Vector2.lenDir(
				-e.Physics.acceleration * delta,
				e.Location.angle - 90
			);
		}

		const speed: Vector2.Vector2 = [
			distance[0] / e.Physics.mass,
			distance[1] / e.Physics.mass,
		];
		e.Physics.force[0] += speed[0];
		e.Physics.force[1] += speed[1];
		e.Location.x += e.Physics.force[0];
		e.Location.y += e.Physics.force[1];

		e.Physics.force[0] *= 1 - e.Physics.drag / e.Physics.mass;
		e.Physics.force[1] *= 1 - e.Physics.drag / e.Physics.mass;

		if (Math.abs(e.Physics.force[0]) < 0.01) {
			e.Physics.force[0] = 0;
		}
		if (Math.abs(e.Physics.force[1]) < 0.01) {
			e.Physics.force[1] = 0;
		}
	}
);

const gamepadMovementSystem = game.systems.create(
	[Gamepad, Location, Physics],
	(e, delta) => {
		const gamepad = navigator.getGamepads()[0];
		if (!gamepad) {
			return;
		}
		if (Vector2.magnitude(gamepad.axes[0], gamepad.axes[1]) >= 0.8) {
			e.Location.angle =
				Vector2.rad2deg(Vector2.angle(gamepad.axes[0], gamepad.axes[1])) + 90;
		}
		let distance: Vector2.Vector2 = [0, 0];
		if (gamepad.buttons[0].pressed) {
			distance = Vector2.lenDir(
				e.Physics.acceleration * delta,
				e.Location.angle - 90
			);
		}

		const speed: Vector2.Vector2 = [
			distance[0] / e.Physics.mass,
			distance[1] / e.Physics.mass,
		];
		e.Physics.force[0] += speed[0];
		e.Physics.force[1] += speed[1];
		e.Location.x += e.Physics.force[0];
		e.Location.y += e.Physics.force[1];

		e.Physics.force[0] *= 1 - e.Physics.drag / e.Physics.mass;
		e.Physics.force[1] *= 1 - e.Physics.drag / e.Physics.mass;
	}
);

const physicsDebugSystem = game.systems.create([Physics, Location], e => {
	const c = game.renderer.context;
	c.save();
	c.strokeStyle = "red";
	c.lineWidth = 2;
	const force = e.Physics.force as Vector2.Vector2;
	const mag = Vector2.magnitude(...force);
	c.moveTo(e.Location.x, e.Location.y);
	c.translate(e.Location.x, e.Location.y);
	c.lineTo(
		...Vector2.lenDir(mag * 20, Vector2.rad2deg(Vector2.angle(...force)))
	);
	c.stroke();
	c.restore();
});

const gamepadSystem = game.systems.create([Gamepad, Physics], e => {});

const uiEntity = game.entities.create([Mouse]);
const UIsystem = game.systems.create([Mouse], e => {
	const c = game.renderer.context;
	paint((parsed as ElementNode).children[0], { x: 0, y: 0 }, c, e.Mouse);
});

game.loop();
