export type ScrollDirection = "up" | "right" | "down" | "left";

export type Entity = {
	id: ReturnType<typeof self.crypto.randomUUID>;
	render?: (context: CanvasRenderingContext2D, lag: number) => void;
	update?: () => void;
	onClick?: (x: number, y: number) => void;
	onScroll?: (x: number, y: number, dir: ScrollDirection) => void;
};
