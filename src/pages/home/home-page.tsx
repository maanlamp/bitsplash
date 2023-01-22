import Canvas from "components/canvas/canvas";
import { GameObject, World, type Game } from "lib/game";
import useGamepad from "lib/gamepad";
import { PhysicsObject } from "lib/physics";
import { Mutable } from "lib/utils";
import fpsCounter from "pages/home/game-objects/fps-counter";
import player from "pages/home/game-objects/player";
import wall from "pages/home/game-objects/wall";
import { useEffect, useRef } from "react";

const world: World = {
	gravity: 1,
	drag: 0.8,
	terminalVelocity: [10, 40],
};

const game: Game = {
	world,
	objects: [fpsCounter],
	timeScale: 1,
	registerGamepad: gamepad => {
		if (gamepad.mapping !== "standard")
			console.warn("Gamepad with non standard layout connected.");

		const newPlayer = player(game, gamepad);
		game.objects.unshift(newPlayer);
	},
	unregisterGamepad: gamepad => {
		const index = game.objects.findIndex(obj => obj.gamepad === gamepad);
		if (index === -1) {
			console.warn(
				"Gamepad was not linked to a ControllableObject and cannot be unregistered",
				gamepad
			);
			return;
		}
		game.objects.splice(index, 1);
	},
};

const HomePage = () => {
	const ctx = useRef(null as any as CanvasRenderingContext2D);

	useExposeGame(game);
	useGameLoop(ctx, game);
	useGamepad(game);
	useCreateWallsOnDrag();

	return (
		<Canvas
			onContext={context => {
				ctx.current = context;
			}}
		/>
	);
};

export default HomePage;

const useCreateWallsOnDrag = () => {
	useEffect(() => {
		let x1: number | undefined;
		let y1: number | undefined;
		let x2: number | undefined;
		let y2: number | undefined;
		let box: GameObject<PhysicsObject> | undefined;
		const startDrawing = (e: MouseEvent) => {
			x1 = e.x;
			y1 = e.y;
			box = {
				id: crypto.randomUUID(),
				components: [
					(self, context, delta) => {
						context.save();
						context.strokeStyle = "#ababab";
						context.lineWidth = 2;
						context.setLineDash([4]);
						context.lineJoin = "round";
						context.strokeRect(...self.position, self.width, self.height);
						context.fillStyle = "#f2f2f2";
						context.fillRect(...self.position, self.width, self.height);
						context.restore();
					},
				],
				position: [x1, y1],
				width: 1,
				height: 1,
				force: [0, 0],
				restitution: 0,
				mass: 0,
				roughness: 0,
				static: true,
			};
			game.objects.push(box);
		};

		const drawBox = (e: MouseEvent) => {
			if (!box) return;
			x2 = e.x;
			y2 = e.y;
			(box as Mutable<GameObject<PhysicsObject>>).width = x2 - x1!;
			(box as Mutable<GameObject<PhysicsObject>>).height = y2 - y1!;
		};

		const completeBox = (e: MouseEvent) => {
			const index = game.objects.findIndex(x => x === box);
			game.objects.splice(
				index,
				1,
				wall(
					[Math.min(x1!, x2!), Math.min(y1!, y2!)],
					Math.abs(x2! - x1!),
					Math.abs(y2! - y1!)
				)
			);
			box = undefined;
			x1 = undefined;
			y1 = undefined;
			x2 = undefined;
			y2 = undefined;
		};

		window.addEventListener("mousedown", startDrawing);
		window.addEventListener("mousemove", drawBox);
		window.addEventListener("mouseup", completeBox);

		return () => {
			window.removeEventListener("mousedown", startDrawing);
			window.removeEventListener("mousemove", drawBox);
			window.removeEventListener("mouseup", completeBox);
		};
	}, []);
};

const useGameLoop = (
	ctx: React.MutableRefObject<CanvasRenderingContext2D>,
	game: Game
) => {
	useEffect(() => {
		let frame: number;
		let earlier = performance.now();

		const tick = (now: number) => {
			const delta = now - earlier;
			earlier = now;

			ctx.current.clearRect(
				0,
				0,
				ctx.current.canvas.width,
				ctx.current.canvas.height
			);

			for (const object of game.objects)
				for (const component of object.components)
					component(object as any, ctx.current, delta);

			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, []);
};

const useExposeGame = (game: Game) => {
	useEffect(() => {
		if ("game" in window) return;
		Object.defineProperty(window, "game", { get: () => game });
		console.log(game);
	}, []);
};
