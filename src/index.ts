import { canvas } from "./canvas.js";
import { Entity } from "./entity.js";
import { Widget, measure, render } from "./render.js";

// https://stackoverflow.com/questions/25612452/html5-canvas-game-loop-delta-time-calculations

const lendir = (len: number, rad: number) =>
	[len * Math.cos(rad), len * Math.sin(rad)] as const;

const viewport = canvas();
const resize = () => {
	viewport.canvas.width = window.innerWidth;
	viewport.canvas.height = window.innerHeight;
};
window.addEventListener("resize", resize);
resize();

const doc: Widget & Entity = {
	id: self.crypto.randomUUID(),
	overflow: "hidden",
	padding: 16,
	gap: 8,
	height: 400,
	width: 400,
	direction: "column",
	children: [
		"FFf1|()test 123\nwaho|o\nding|ong wahasd",
		{
			padding: 8,
			children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
		},
		{
			padding: 8,
			children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
		},
		{
			padding: 16,
			gap: 8,
			direction: "row",
			children: [
				"FFf1|()test 123\nwaho|o\nding|ong wahasd",
				{
					padding: 8,
					children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
				},
				{
					padding: 8,
					children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
				},
				{
					padding: 8,
					children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
				},
				{
					padding: 8,
					children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
				},
			],
		},
		{
			padding: 8,
			children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
		},
		{
			padding: 8,
			children: ["FFf1|()test 123\nwaho|o\nding|ong wahasd"],
		},
	],
	update: () => {
		const preferred = measure(viewport, doc);
		const difference = {
			height: doc.height! - preferred.height,
			width: doc.width! - preferred.width,
		};
		(doc.scroll ??= {}).vertical =
			((Math.sin(tick / 25) + 1) / 2) * difference.height;
		(doc.scroll ??= {}).horizontal =
			((Math.cos(tick / 50) + 1) / 2) * difference.width;
	},
	render: () => render(viewport, doc, 100, 100),
};

const entities: Array<Entity> = [doc];

// Setup
const TICKS_PER_SECOND = 120;
const MS_PER_TICK = 1000 / TICKS_PER_SECOND;
let fps = 0;
let start = performance.now();
let lag = 0;
let delta = 0;
let tick = -1;

const gameloop = () => {
	// Time
	requestAnimationFrame(gameloop);
	const now = performance.now();
	delta = now - start;
	start = now;

	// Update
	lag += delta;
	while (lag >= MS_PER_TICK) {
		tick++;
		for (const entity of entities) entity.update?.();
		lag -= MS_PER_TICK;
	}

	// Render
	// TODO: text height measuring seems to be off for larger values
	viewport.font = "15px DM Mono";
	viewport.fillStyle = "black";
	viewport.fillRect(0, 0, viewport.canvas.width, viewport.canvas.height);
	const sizeString = viewport.canvas.width + " × " + viewport.canvas.height;
	viewport.fillStyle = "white";
	viewport.fillText("Δt " + delta.toFixed(2) + " ~ " + lag.toFixed(2), 3, 15);
	viewport.fillText(tick.toString(), 3, 31);
	viewport.fillText(Math.round(fps) + " fps", 3, 46);
	viewport.fillText(
		sizeString,
		viewport.canvas.width - viewport.measureText(sizeString).width - 3,
		15
	);
	for (const entity of entities) {
		if (entity.render) {
			viewport.save();
			entity.render(viewport, lag / MS_PER_TICK);
			viewport.restore();
		}
	}
};

document.body.append(viewport.canvas);
gameloop();
setInterval(() => {
	fps = 1000 / delta;
}, 1000);

// const hitTest = (entity: Entity, x: number, y: number) =>
// 	x >= entity.x &&
// 	x <= entity.x + entity.w &&
// 	y >= entity.y &&
// 	y <= entity.y + entity.h;

// window.addEventListener("click", e => {
// 	const [x, y] = [e.pageX, e.pageY];
// 	for (const entity of entities) {
// 		if (hitTest(entity, x, y)) {
// 			entity.onClick?.(x, y);
// 		}
// 	}
// });

// window.addEventListener("wheel", e => {
// 	const [x, y, dir] = [
// 		e.pageX,
// 		e.pageY,
// 		(e.deltaY < 0
// 			? e.shiftKey
// 				? "left"
// 				: "up"
// 			: e.shiftKey
// 			? "right"
// 			: "down") as ScrollDirection,
// 	];
// 	for (const entity of entities) {
// 		if (hitTest(entity, x, y)) {
// 			entity.onScroll?.(x, y, dir);
// 		}
// 	}
// });
