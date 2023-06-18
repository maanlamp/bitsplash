import { MouseButton, ScrollDirection } from "./game.js";
import { Point } from "./util.js";

export type Entity = {
	id: ReturnType<typeof self.crypto.randomUUID>;
	position: Point;
	render?: (context: CanvasRenderingContext2D, lag: number) => void;
	update?: () => void;
	onClick?: (x: number, y: number, button: MouseButton) => void;
	onScroll?: (x: number, y: number, dir: ScrollDirection) => void;
};
