import { canvas } from "./canvas.js";
import { Entity } from "./entity.js";

const viewport = canvas();
const resize = () => {
	viewport.canvas.width = window.innerWidth;
	viewport.canvas.height = window.innerHeight;
};
window.addEventListener("resize", resize);
resize();

export type ScrollDirection = "up" | "right" | "down" | "left";

export type MouseButton = "left" | "right" | "middle";

type Game = {
	readonly TICKS_PER_SECOND: number;
	readonly MS_PER_TICK: number;
	readonly FPS: number;

	readonly mouse?: {
		x: number;
		y: number;
		readonly button: MouseButton;
		readonly scrollDirection: ScrollDirection;
	};
	readonly loop: () => void;
	readonly viewport: CanvasRenderingContext2D;

	entities: Array<Entity>;
};

let start = performance.now();
let lag = 0;
let delta = 0;
let tick = -1;
const TICKS_PER_SECOND = 120;
const game: Game = {
	TICKS_PER_SECOND,
	MS_PER_TICK: 1000 / TICKS_PER_SECOND,
	FPS: 0,
	viewport,
	entities: [],
	loop: () => {
		// Time
		requestAnimationFrame(game.loop);
		const now = performance.now();
		delta = now - start;
		start = now;

		// Update
		lag += delta;
		while (lag >= game.MS_PER_TICK) {
			for (const entity of game.entities) entity.update?.();
			tick++;
			lag -= game.MS_PER_TICK;
		}

		// Render
		viewport.font = "15px DM Mono";
		viewport.fillStyle = "white";
		viewport.fillRect(0, 0, viewport.canvas.width, viewport.canvas.height);
		const sizeString = viewport.canvas.width + " × " + viewport.canvas.height;
		viewport.fillStyle = "black";
		viewport.fillText("Δt " + delta.toFixed(2) + " ~ " + lag.toFixed(2), 3, 15);
		viewport.fillText(tick.toString(), 3, 31);
		viewport.fillText(
			Math.round(game.FPS) + " fps @ " + game.TICKS_PER_SECOND + " tps",
			3,
			46
		);
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

setInterval(() => {
	// @ts-ignore Only the game is allowed to mutate FPS
	game.FPS = 1000 / delta;
}, 1000);

window.addEventListener("mousemove", e => {
	e.preventDefault();
	const [x, y] = [e.clientX, e.clientY];
	// @ts-ignore Only the game is allowed to mutate mouse
	(game.mouse ??= {}).x = x;
	// @ts-ignore Only the game is allowed to mutate mouse
	(game.mouse ??= {}).y = y;
});

window.addEventListener("click", e => {
	e.preventDefault();
	// @ts-ignore Only the game is allowed to mutate mouse
	(game.mouse ??= {}).button = "left";
});

window.addEventListener("contextmenu", e => {
	e.preventDefault();
	// @ts-ignore Only the game is allowed to mutate mouse
	(game.mouse ??= {}).button = "right";
});

window.addEventListener("wheel", e => {
	// @ts-ignore Only the game is allowed to mutate mouse
	(game.mouse ??= {}).scrollDirection = (
		e.deltaY < 0 ? (e.shiftKey ? "left" : "up") : e.shiftKey ? "right" : "down"
	) as ScrollDirection;
});

// @ts-ignore DEBUG
window.game = game;
console.info(
	`%cℹ️ You can inspect the current gamestate by typing "game" into the console.`,
	"font-weight: 600"
);

export default game;
