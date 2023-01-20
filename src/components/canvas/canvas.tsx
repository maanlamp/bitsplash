import { useEffect, useRef } from "react";

export type Entity = Readonly<{
	update: (
		canvas: HTMLCanvasElement,
		context: CanvasRenderingContext2D,
		delta: number
	) => void;
	render?: (
		canvas: HTMLCanvasElement,
		context: CanvasRenderingContext2D,
		delta: number
	) => void;
}>;

type CanvasProps = Readonly<{ entities: ReadonlyArray<Entity> }>;

const Canvas = ({ entities }: CanvasProps) => {
	const canvas = useRef(null as any as HTMLCanvasElement);
	const ctx = useRef(null as any as CanvasRenderingContext2D);

	useEffect(() => {
		ctx.current = canvas.current!.getContext("2d")!;

		const size = canvas.current.parentElement!.getBoundingClientRect();
		canvas.current.width = size.width;
		canvas.current.height = size.height;
	}, []);

	useEffect(() => {
		const tick = (time: number) => {
			const delta = performance.now() - time;

			ctx.current.clearRect(0, 0, canvas.current.width, canvas.current.height);

			for (const entity of entities) {
				entity.update(canvas.current, ctx.current, delta);
				entity.render?.(canvas.current, ctx.current, delta);
			}

			requestAnimationFrame(tick);
		};

		tick(performance.now());
	}, []);

	return <canvas ref={canvas} className="flex column" />;
};

export default Canvas;
