export type ScrollDirection = "up" | "right" | "down" | "left";

export type MouseButton = "left" | "right" | "middle";

export type Entity = {
	id: ReturnType<typeof self.crypto.randomUUID>;
	render?: (context: CanvasRenderingContext2D, lag: number) => void;
	update?: () => void;
	hitTest: (x: number, y: number) => boolean;
	onClick?: (x: number, y: number, button: MouseButton) => void;
	onScroll?: (x: number, y: number, dir: ScrollDirection) => void;
};
