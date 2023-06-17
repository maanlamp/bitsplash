import { canvas } from "./canvas.js";
import { Entity, MouseButton, ScrollDirection } from "./entity.js";
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

const doc: Widget & Entity & { x: number; y: number } = {
	x: 100,
	y: 100,
	id: self.crypto.randomUUID(),
	padding: 32,
	gap: 32,
	width: 500,
	direction: "column",
	background: "red",
	mainAxisAlignment: "end",
	crossAxisAlignment: "end",
	children: [
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin non eros leo. Integer lacinia mi eget nisi pretium tempus. Donec malesuada dolor eu diam pellentesque, sit amet posuere tortor interdum. Maecenas lacinia, neque eget pellentesque mollis, neque justo gravida nibh, sed posuere diam turpis quis libero. Vivamus pulvinar dapibus sem accumsan sodales. Nam tempor nec diam sed rutrum. In ut luctus mauris. Ut fermentum tincidunt aliquam. In volutpat nulla a blandit feugiat.",
		{
			padding: 8,
			background: "blue",
			children: [
				"Maecenas eget sem eu massa sodales sodales a vulputate odio. Vestibulum eget mauris et orci ultrices euismod. Maecenas ultrices semper rutrum. Maecenas aliquam, quam bibendum ultrices blandit, nibh tellus tincidunt orci, eget tincidunt justo quam ut velit. Cras rutrum justo vitae dapibus viverra.",
			],
		},
		{
			padding: 16,
			background: "green",
			children: [
				"Vivamus iaculis libero id enim efficitur, quis sollicitudin ante vestibulum. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Phasellus odio diam, ornare et placerat sed, volutpat sit amet leo.",
			],
		},
		{
			padding: 32,
			gap: 8,
			direction: "row",
			background: "rgba(64,64,64)",
			children: [
				"Morbi at diam augue. Donec convallis tortor nunc, vel pharetra odio rhoncus a. Etiam velit enim, auctor at condimentum a, luctus nec augue. Vestibulum ut aliquet sem. Nullam tempor tristique mauris et pellentesque. Ut auctor, libero vel porttitor imperdiet, quam sapien feugiat odio, eget tristique nunc purus sed orci. Cras in erat augue. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Pellentesque ac velit imperdiet, pulvinar augue non, facilisis ipsum. Pellentesque ligula eros, laoreet quis hendrerit at, malesuada sollicitudin mauris. Mauris ornare felis lacus, quis rutrum lectus iaculis molestie.",
				{
					background: "rgba(64,128,64)",
					padding: 8,
					children: [
						"Quisque lacinia ex erat, in viverra augue placerat non. Sed consectetur convallis nisl, et sodales nisi vestibulum pellentesque. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Cras auctor, lacus sed elementum blandit, justo orci consectetur purus, nec facilisis purus leo non dolor. Sed hendrerit ligula ac pharetra tempus. Pellentesque elit massa, sodales nec laoreet quis, pellentesque quis enim. Fusce tempor hendrerit viverra. Fusce nec dolor convallis metus ullamcorper sollicitudin vel in metus. Nullam sem libero, rhoncus at dolor nec, ullamcorper accumsan erat. Pellentesque sollicitudin ultricies lobortis. Proin nunc magna, auctor ac vestibulum eu, vulputate eu ex. Suspendisse sagittis ligula at sem commodo interdum. Fusce rhoncus at velit a egestas.",
					],
				},
				{
					padding: 8,
					background: "rgba(64,128,128)",
					children: [
						"Cras fermentum lorem eget augue congue, at tristique felis mollis. Quisque vitae quam augue. Fusce vulputate nisi sit amet felis laoreet cursus. Aenean dictum mi vel dolor ornare sagittis. In scelerisque nunc a ex semper, et aliquet metus rutrum. Quisque ut velit nulla. Suspendisse facilisis ante velit, id pretium enim interdum vel.",
					],
				},
				{
					padding: 8,
					background: "rgba(128,128,128)",
					children: [
						"Donec ut neque nulla. Pellentesque aliquam gravida nisi a pretium. Vivamus ut est euismod ex congue molestie. Nunc sed odio est. Proin ac turpis erat. Integer pretium, nisl vel varius consequat, risus tellus fringilla leo, eu luctus sem velit ut libero. Donec sit amet rhoncus lorem. Aenean velit erat, pretium sit amet lacus vel, maximus ultrices enim. Curabitur tincidunt lectus eget eros bibendum, eu sagittis est porttitor. Nulla bibendum nisi vitae erat vulputate pellentesque. Praesent porta felis id purus laoreet tincidunt.",
					],
				},
				{
					padding: 8,
					background: "rgba(256,128,128)",
					children: [
						"Aenean nec magna et tellus sollicitudin sodales. Sed id eleifend eros. Phasellus porta, tellus sit amet blandit viverra, odio eros blandit mi, non convallis diam libero sit amet nisl. Aenean tincidunt enim at neque accumsan, non dapibus quam cursus. In lacinia odio sit amet gravida interdum. Nunc nec magna laoreet, dignissim sem sed, pellentesque urna. Vivamus maximus nulla sit amet nibh hendrerit, id aliquet augue laoreet. Nunc lorem turpis, molestie sit amet tempus sed, dictum id eros. Nunc id dui porttitor, dapibus quam eget, ultricies nibh. Integer auctor sem eget viverra interdum. Morbi luctus egestas pellentesque. Phasellus a magna diam. Vestibulum dolor nisl, pharetra ut ornare at, rutrum vel massa. Aliquam pulvinar diam quis neque condimentum eleifend.",
					],
				},
			],
		},
		{
			padding: 8,
			background: "rgba(128,64,64)",
			children: [
				"Proin sit amet tellus quis nisl maximus blandit at eu arcu. Praesent efficitur fringilla elit, sit amet malesuada diam hendrerit viverra. Sed in venenatis tortor, eu dictum dui. Phasellus commodo blandit turpis a placerat. Pellentesque malesuada, est sit amet convallis viverra, enim ex elementum dui, et convallis erat velit in lorem. Suspendisse feugiat pretium mi eget molestie. Pellentesque pharetra lacus ultrices dapibus suscipit. Donec lobortis ante ac nisl finibus pellentesque. Maecenas venenatis massa sed augue consequat sagittis.",
			],
		},
		{
			background: "rgba(64,64,128)",
			padding: 8,
			children: [
				"Suspendisse volutpat commodo nunc eu eleifend. Cras ullamcorper dui mi, nec cursus neque posuere sit amet. Aliquam pharetra diam urna, ac tincidunt dolor consectetur in. In hac habitasse platea dictumst. Praesent commodo erat nisi, sit amet eleifend turpis pretium et. Proin volutpat justo ut turpis sollicitudin dictum. Etiam dictum nulla sem, in tincidunt tortor tristique id. Integer porttitor posuere tempor. Nullam orci ipsum, elementum eget finibus nec, mattis et lectus.",
			],
		},
	],
	hitTest: (x, y) => {
		const size = { width: doc.width, height: doc.height };
		if (size.width === undefined || size.height === undefined) {
			const preferred = measure(viewport, doc);
			size.width = Math.min(size.width ?? Infinity, preferred.width);
			size.height = Math.min(size.height ?? Infinity, preferred.height);
		}
		return (
			x >= doc.x &&
			x <= doc.x + size.width &&
			y >= doc.y &&
			y <= doc.y + size.height
		);
	},
	onClick: () => {
		console.log(doc);
	},
	onScroll: (x, y, dir) => {
		doc.scroll ??= { vertical: 0, horizontal: 0 };
		const preferred = measure(viewport, doc);
		switch (dir) {
			case "up": {
				if (preferred.height < (doc.height ?? 0)) return;
				doc.scroll.vertical! += 50;
				doc.scroll.vertical = Math.min(0, doc.scroll.vertical!);
				break;
			}
			case "down": {
				if (preferred.height < (doc.height ?? 0)) return;
				doc.scroll.vertical! -= 50;
				const diff = -(preferred.height - (doc.height ?? 0));
				doc.scroll.vertical = Math.max(diff, doc.scroll.vertical!);
				break;
			}
			case "left": {
				if (preferred.width < (doc.width ?? 0)) return;
				doc.scroll.horizontal! += 50;
				doc.scroll.horizontal = Math.min(0, doc.scroll.horizontal!);
				break;
			}
			case "right": {
				if (preferred.width < (doc.width ?? 0)) return;
				doc.scroll.horizontal! -= 50;
				const diff = -(preferred.width - (doc.width ?? 0));
				doc.scroll.horizontal = Math.max(diff, doc.scroll.horizontal!);
				break;
			}
		}
	},
	render: () => render(viewport, doc, doc.x, doc.y),
};

type Game = {
	readonly TICKS_PER_SECOND: number;
	readonly MS_PER_TICK: number;
	readonly FPS: number;

	mouse?: {
		click?: {
			x: number;
			y: number;
			button: MouseButton;
		};
		scroll?: {
			x: number;
			y: number;
			dir: ScrollDirection;
		};
	};
	entities: Array<Entity>;
	loop: () => void;
};

let start = performance.now();
let lag = 0;
let delta = 0;
let tick = -1;
const game: Game = {
	TICKS_PER_SECOND: 120,
	MS_PER_TICK: 1000 / 120,
	FPS: 0,
	entities: [doc],
	loop: () => {
		// Time
		requestAnimationFrame(game.loop);
		const now = performance.now();
		delta = now - start;
		start = now;

		// Update
		lag += delta;
		while (lag >= game.MS_PER_TICK) {
			const hitCache: Record<Entity["id"], Entity> = {};
			if (game.mouse?.click) {
				for (const entity of game.entities) {
					if (
						!hitCache[entity.id] &&
						!entity.hitTest(game.mouse.click.x, game.mouse.click.y)
					)
						continue;
					hitCache[entity.id] = entity;
					entity.onClick?.(
						game.mouse.click.x,
						game.mouse.click.y,
						game.mouse.click.button
					);
				}
				delete game.mouse.click;
			}
			if (game.mouse?.scroll) {
				for (const entity of game.entities) {
					if (
						!hitCache[entity.id] &&
						!entity.hitTest(game.mouse.scroll.x, game.mouse.scroll.y)
					)
						continue;
					hitCache[entity.id] = entity;
					entity.onScroll?.(
						game.mouse.scroll.x,
						game.mouse.scroll.y,
						game.mouse.scroll.dir
					);
				}
				delete game.mouse.scroll;
			}

			for (const entity of game.entities) entity.update?.();

			tick++;
			lag -= game.MS_PER_TICK;
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
		viewport.fillText(Math.round(game.FPS) + " fps", 3, 46);
		viewport.fillText(
			sizeString,
			viewport.canvas.width - viewport.measureText(sizeString).width - 3,
			15
		);
		for (const entity of game.entities) {
			if (entity.render) {
				viewport.save();
				entity.render(viewport, lag / game.MS_PER_TICK);
				viewport.restore();
			}
		}
	},
};

document.body.append(viewport.canvas);
game.loop();
setInterval(() => {
	// @ts-ignore Only the game is allowed to mutate FPS
	game.FPS = 1000 / delta;
}, 1000);
window.addEventListener("click", e => {
	e.preventDefault();
	const [x, y] = [e.pageX, e.pageY];
	(game.mouse ??= {}).click = { x, y, button: "left" };
});
window.addEventListener("contextmenu", e => {
	e.preventDefault();
	const [x, y] = [e.pageX, e.pageY];
	(game.mouse ??= {}).click = { x, y, button: "right" };
});
window.addEventListener("wheel", e => {
	const [x, y, dir] = [
		e.pageX,
		e.pageY,
		(e.deltaY < 0
			? e.shiftKey
				? "left"
				: "up"
			: e.shiftKey
			? "right"
			: "down") as ScrollDirection,
	];
	(game.mouse ??= {}).scroll = { x, y, dir };
});
