import { canvas } from "./canvas.js";
import { Document, paint } from "./render.js";
const viewport = canvas({
	width: window.innerWidth,
	height: window.innerHeight,
});
const resize = () => {
	viewport.canvas.width = window.innerWidth;
	viewport.canvas.height = window.innerHeight;
};
window.addEventListener("resize", resize);
export type ScrollDirection = "up" | "right" | "down" | "left";
export type MouseButton = "left" | "right" | "middle";
type Game = {
	readonly TICKS_PER_SECOND: number;
	readonly MS_PER_TICK: number;
	readonly FPS: number;
	readonly LAST_FRAMETIME: number;
	readonly REFRESH_RATE: number;
	readonly mouse?: {
		x: number;
		y: number;
		readonly button: MouseButton;
		readonly scrollDirection: ScrollDirection;
	};
	readonly loop: () => void;
	readonly viewport: CanvasRenderingContext2D;
	entities: Array<any>;
	document: Document;
};
let start = performance.now();
let lag = 0;
let delta = 0;
let tick = -1;
const TICKS_PER_SECOND = 120;
const REFRESH_RATE = 60; // Should be the monitor's refresh rate but you can't really get that from anywhere
const game = (document: Document) => {
	const game: Game = {
		TICKS_PER_SECOND,
		LAST_FRAMETIME: 0,
		MS_PER_TICK: 1000 / TICKS_PER_SECOND,
		FPS: 0,
		REFRESH_RATE,
		viewport,
		entities: [],
		document,
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
			const before = performance.now();
			for (const entity of game.entities) {
				if (entity.render) {
					viewport.save();
					entity.render(viewport, lag / game.MS_PER_TICK);
					viewport.restore();
				}
			}
			paint(game.document, game.viewport);
			viewport.font = "15px DM Mono";
			const sizeString = viewport.canvas.width + " × " + viewport.canvas.height;
			viewport.fillStyle = "black";
			viewport.fillText(
				"Δt " + delta.toFixed(2) + "ms" + " ~ " + lag.toFixed(2) + "ms",
				3,
				15
			);
			viewport.fillText(tick.toString(), 3, 31);
			viewport.fillText(
				"fps " +
					Math.round(game.FPS) +
					" ~ " +
					game.LAST_FRAMETIME.toFixed(2) +
					"/" +
					(1000 / REFRESH_RATE).toFixed(2) +
					"ms",
				3,
				46
			);
			viewport.fillText("tps " + game.TICKS_PER_SECOND, 3, 61);
			viewport.fillText(
				sizeString,
				viewport.canvas.width - viewport.measureText(sizeString).width - 3,
				15
			);
			// @ts-ignore Only the game is allowed to mutate LAST_FRAMETIME
			game.LAST_FRAMETIME = performance.now() - before;
		},
	};
	window.document.body.append(viewport.canvas);
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
			e.deltaY < 0
				? e.shiftKey
					? "left"
					: "up"
				: e.shiftKey
				? "right"
				: "down"
		) as ScrollDirection;
	});
	// @ts-ignore DEBUG
	window.game = game;
	console.info(
		`%cℹ️ You can inspect the current gamestate by typing "game" into the console.`,
		"font-weight: 600"
	);
	return game;
};
export default game;
