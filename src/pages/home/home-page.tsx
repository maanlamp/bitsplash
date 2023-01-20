import Canvas, { Entity } from "components/canvas/canvas";

const player: Entity & Record<string, any> = {
	x: 0,
	y: 0,
	update: (canvas, context, delta: number) => {
		player.x += 5 * delta;
		player.y += 5 * delta;

		if (player.x > canvas.width) player.x = 0;
		if (player.y > canvas.height) player.y = 0;
	},
	render: (canvas, context, delta) => {
		context.fillStyle = "red";
		context.beginPath();
		context.arc(player.x, player.y, 5, 0, 360);
		context.closePath();
		context.fill();
	},
};

const HomePage = () => {
	//

	return <Canvas entities={[player]} />;
};

export default HomePage;
