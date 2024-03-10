import shipSrc from "./assets/ship.png";
import Game from "./core/game.js";
import { program, run } from "./core/markup.js";
import { render } from "./core/render.js";

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
}
`.trim();
document.head.append(style);

let viewport: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
const update = () => {
	try {
		const parsed = run(program)(
			document.querySelector<HTMLTextAreaElement>("#input")!.value!
		);
		viewport = render(parsed) as HTMLCanvasElement;
		ctx = viewport.getContext("2d")!;
		clear(rendered).append(viewport);
		clear(raw).append(JSON.stringify(parsed, null, 2));
		raw.removeAttribute("style");
	} catch (error: any) {
		clear(rendered);
		clear(raw).append(error.stack);
		raw.style.background = "red";
		raw.style.color = "yellow";
		raw.style.padding = "1rem";
		raw.style.display = "flex";
		raw.style.justifyContent = "center";
		raw.style.alignItems = "center";
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
				radius={5}
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
			<canvas>
				{
					(context, pos, size) => {
						context.fillStyle = "red";
						context.fillRect(pos.x,pos.y,size.w,size.h);
					}
				}
			</canvas>
			<grid columns={4} gap={4} fill="blue">
				<box>1</box>
				<box>2</box>
				<box>3</box>
				<box>4</box>
				<box>5</box>
				<box>6</box>
				<box>7</box>
				<box>8</box>
				<box>9</box>
				<box>10</box>
				<box>11</box>
				<box>12</box>
				<box>13</box>
				<box>14</box>
				<box>15</box>
				<box>16</box>
				<box>17</box>
				<box>18</box>
				<box>19</box>
				<box>20</box>
				<box>21</box>
				<box>22</box>
				<box>23</box>
				<box>24</box>
				<box>25</box>
				<box>26</box>
				<box>27</box>
				<box>28</box>
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

const Health = () => {
	const maxHp = 100;
	return {
		maxHp,
		hp: maxHp,
	};
};

const Position = () => ({
	x: 50,
	y: 50,
});

const shipImg = new Image();
shipImg.src = shipSrc;
const Drawable = () => ({
	img: shipImg,
	offsetX: 0,
	offsetY: 0,
});

const playerId = game.entities.create([Health, Position, Drawable]);

game.systems.create([Position, Drawable], e => {
	ctx.drawImage(e.Drawable.img, e.Position.x, e.Position.y);
});

const DELTAS: number[] = [];
const MAX_DELTAS = 150;
const GRAPH_STEP_SIZE = 0.66;
const GRAPH_HEIGHT = 50;
const GRAPH_OFFSET_X = 8;
const GRAPH_OFFSET_Y = 8;
const beforeTick = (delta: number) => {
	ctx.clearRect(0, 0, viewport.width, viewport.height);
	ctx.save();
	DELTAS.push(delta);
	if (DELTAS.length > MAX_DELTAS) {
		DELTAS.shift();
	}
	ctx.fillStyle = "rgba(0,0,0,0.5)";
	ctx.fillRect(
		GRAPH_OFFSET_X,
		GRAPH_OFFSET_Y,
		MAX_DELTAS * GRAPH_STEP_SIZE,
		GRAPH_HEIGHT
	);
	ctx.strokeStyle = "lime";
	ctx.moveTo(GRAPH_OFFSET_X, GRAPH_OFFSET_Y + GRAPH_HEIGHT);
	ctx.beginPath();
	for (let i = 0; i < DELTAS.length; i++) {
		ctx.lineTo(
			GRAPH_OFFSET_X + i * GRAPH_STEP_SIZE,
			GRAPH_OFFSET_Y +
				GRAPH_HEIGHT -
				(GRAPH_HEIGHT - 18) * (1000 / DELTAS[i] / 60)
		);
	}
	ctx.stroke();
	ctx.fillStyle = "lime";
	ctx.fillText(
		(1000 / delta).toFixed() +
			" FPS, μ∆=" +
			(DELTAS.reduce((acc, d) => acc + d, 0) / DELTAS.length).toFixed(4),
		GRAPH_OFFSET_X + 2,
		GRAPH_OFFSET_Y + 11
	);
	ctx.restore();
	// TODO: Consolidate ECS and render()
};

// game.loop(beforeTick);
