import { Vector2 } from "lib/vector";

export type Game = Readonly<{
	world: World;
	objects: GameObject<any>[];
	timeScale: number;
	registerGamepad: (gamepad: Gamepad) => void;
	unregisterGamepad: (gamepad: Gamepad) => void;
}>;

export type GameObject<T = void> = Readonly<
	{
		id: string;
		components: ReadonlyArray<ReturnType<Component<T>>>;
	} & T
>;

export type Component<T = void> = (
	game: Game
) => (
	self: GameObject<T>,
	context: CanvasRenderingContext2D,
	delta: number
) => void;

export type World = Readonly<{
	gravity: number;
	drag: number;
	terminalVelocity: Vector2;
}>;
