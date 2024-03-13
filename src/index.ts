import shipSrc from "./assets/ship.png";
import Game from "./core/game";
import { ElementNode, Node, program, run } from "./core/markup";
import { paint, type Mouse } from "./core/paint";
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

let parsed: Node;
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
<game hover="4px orange">
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
			<box fill="orange">Lorem</box>
			<box fill="teal">Ipsum</box>
			<box fill="purple">dolor</box>
			<canvas painter={
				(context, pos, size) => {
					context.fillStyle = \`hsl(\${performance.now()/30%360}deg,100%,50%)\`;
					context.fillRect(pos.x,pos.y,size.w,size.h);
				}
			}/>
			<grid columns={4} gap={4} fill="white" color="black">
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
</game>
`.trim();

(input as any).addEventListener("input", update);
document.body.append(output, input);
update();

// ECS

const game = Game();
rendered.append(game.renderer.viewport);
const resize = () => {
	const size = rendered.getBoundingClientRect();
	game.renderer.viewport.width = size.width;
	game.renderer.viewport.height = size.height;
};
window.addEventListener("resize", resize);
resize();

const Health = () => {
	const max = 100;
	return {
		max,
		current: max,
	};
};

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

const _keys: Record<string, boolean> = {};
const handleKey = (e: KeyboardEvent) => {
	if (e.repeat) return;
	_keys[e.key.toUpperCase()] = e.type === "keydown";
};
window.addEventListener("keyup", handleKey);
window.addEventListener("keydown", handleKey);
const Keys = () => _keys;
const keySystem = game.systems.create([Keys, Location], e => {
	if (e.Keys.A) {
		e.Location.angle -= 3;
	}
	if (e.Keys.D) {
		e.Location.angle += 3;
	}
	if (e.Keys.W) {
		const [x, y] = Vector2.lenDir(3, e.Location.angle - 90);
		e.Location.x += x;
		e.Location.y += y;
	}
	if (e.Keys.S) {
		const [x, y] = Vector2.lenDir(-3, e.Location.angle - 90);
		e.Location.x += x;
		e.Location.y += y;
	}
});

const _mouse: Mouse = { x: -Infinity, y: -Infinity };
const handleMouseButton = (e: MouseEvent) => {
	_mouse[e.button] = e.type === "mousedown";
};
window.addEventListener("mousedown", handleMouseButton);
window.addEventListener("mouseup", handleMouseButton);
window.addEventListener("mousemove", e => {
	_mouse.x = e.x;
	_mouse.y = e.y;
});
const Mouse = () => _mouse;

const playerId = game.entities.create([Health, Location, Drawable, Keys]);

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

const healthBarSystem = game.systems.create([Health, Location, Drawable], e => {
	const c = game.renderer.context;
	const w = e.Drawable.img.width;
	const h = e.Drawable.img.height;
	c.save();
	c.fillStyle = "red";
	c.fillRect(
		e.Location.x - w / 2 + e.Drawable.offsetX,
		e.Location.y - h / 2 + e.Drawable.offsetY,
		w,
		8
	);
	c.fillStyle = "lime";
	c.fillRect(
		e.Location.x - w / 2 + e.Drawable.offsetX,
		e.Location.y - h / 2 + e.Drawable.offsetY,
		(e.Health.current / e.Health.max) * w,
		8
	);
	c.restore();
	e.Health.current -= 1;
	if (e.Health.current < 0) {
		e.Health.current = e.Health.max;
	}
});

const uiEntity = game.entities.create([Mouse]);
const UIsystem = game.systems.create([Mouse], e => {
	const c = game.renderer.context;
	paint((parsed as ElementNode).children[0], { x: 0, y: 0 }, c, e.Mouse);
});

game.loop();
