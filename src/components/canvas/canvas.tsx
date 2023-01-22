import { useEffect, useRef } from "react";

type CanvasProps = Readonly<{
	onContext: (context: CanvasRenderingContext2D) => void;
}>;

const Canvas = ({ onContext }: CanvasProps) => {
	const canvas = useRef(null as any as HTMLCanvasElement);

	useResizeToFitParent(canvas);

	useEffect(() => {
		onContext(canvas.current.getContext("2d")!);
	}, []);

	return <canvas ref={canvas} />;
};

export default Canvas;

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
