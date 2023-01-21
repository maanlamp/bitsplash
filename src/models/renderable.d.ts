type Renderable = Readonly<{
	render: (context: CanvasRenderingContext2D, delta: number) => void;
}>;

export default Renderable;
