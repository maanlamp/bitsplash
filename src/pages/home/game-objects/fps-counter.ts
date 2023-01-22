import { GameObject } from "lib/game";

const fpsCounter: GameObject = {
	id: crypto.randomUUID(),
	components: [
		(self, context, delta) => {
			const fps = `${Math.round(1000 / delta).toString()} fps`;
			const h = 12;
			context.font = `normal ${h}px "Fira Code"`;
			const w = context.measureText(fps).width;
			context.save();
			context.fillStyle = "rgba(0,0,0,.5)";
			context.fillRect(0, 0, w, h + h * 0.33);
			context.fillStyle = "lime";
			context.fillText(fps, 0, h);
			context.restore();
		},
	],
};

export default fpsCounter;
