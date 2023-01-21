type Entity = Readonly<{
	update: (context: CanvasRenderingContext2D, delta: number) => void;
}>;

export default Entity;
