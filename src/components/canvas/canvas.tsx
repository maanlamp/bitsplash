import Entity from "models/entity";
import Renderable from "models/renderable";
import { useEffect, useRef } from "react";

type CanvasProps = Readonly<{
	entities: ReadonlyArray<Entity & Partial<Renderable>>;
}>;

const Canvas = ({ entities }: CanvasProps) => {
	const canvas = useRef(null as any as HTMLCanvasElement);
	const ctx = useRef(null as any as CanvasRenderingContext2D);

	useEffect(() => {
		ctx.current = canvas.current!.getContext("2d")!;
	}, []);

	useResizeToFitParent(canvas);

	useGameLoop(ctx, entities);

	return <canvas ref={canvas} className="flex column" />;
};

export default Canvas;

const useGameLoop = (
	ctx: React.MutableRefObject<CanvasRenderingContext2D>,
	entities: ReadonlyArray<Entity & Partial<Renderable>>
) => {
	useEffect(() => {
		let frame: number;
		let lastTime = performance.now();
		const tick = (time: number) => {
			const delta = time - lastTime;
			lastTime = time;

			ctx.current.clearRect(
				0,
				0,
				ctx.current.canvas.width,
				ctx.current.canvas.height
			);

			for (const entity of entities) {
				entity.update(ctx.current, delta);
			}

			for (const entity of entities) {
				ctx.current.save();
				entity.render?.(ctx.current, delta);
				ctx.current.restore();
			}

			const fps = Math.round(1000 / delta).toString() + " fps";
			ctx.current.fillStyle = "rgba(0,0,0,.33)";
			ctx.current.fillRect(8, 8, ctx.current.measureText(fps).width + 1, 9);
			ctx.current.fillStyle = "lime";
			ctx.current.font = "10px 'Fira Code'";
			ctx.current.fillText(fps, 8, 16);

			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, []);
};

const useResizeToFitParent = (
	canvas: React.MutableRefObject<HTMLCanvasElement>
) => {
	useEffect(() => {
		const resize = () => {
			canvas.current.width = 0;
			canvas.current.height = 0;
			setTimeout(() => {
				const size = canvas.current.parentElement!.getBoundingClientRect();
				canvas.current.width = size.width;
				canvas.current.height = size.height;
			}, 0);
		};

		const observer = new ResizeObserver(resize);
		observer.observe(canvas.current);
		window.addEventListener("resize", resize);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", resize);
		};
	}, []);
};
