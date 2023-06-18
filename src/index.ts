import { Entity } from "./entity.js";
import game from "./game.js";
import { LayoutDirection, Renderable, render } from "./render.js";
import { Point } from "./util.js";

const img = new Image();
img.src = "https://i1.sndcdn.com/artworks-qboq5y833FMsteVT-tQdkzg-t500x500.jpg";

const Box = (position: Point, direction: LayoutDirection) => {
	const self: Renderable & Entity = {
		id: crypto.randomUUID(),
		type: "box",
		position,
		style: { background: "rgb(200,200,200)" },
		layout: {
			gap: 32,
			direction: direction,
			padding: 16,
		},
		children: [
			{
				type: "text",
				style: { font: { size: 16 } },
				text: "Lorem ipsum dolor sit amet.",
			},
			{
				type: "box",
				style: { background: { image: img } },
				layout: { padding: 16 },
				children: [
					{
						type: "text",
						style: { colour: "white", font: { size: 12 } },
						text: "Consectetur adipiscing elit.",
					},
				],
			},
			{
				type: "box",
				layout: { padding: 4 },
				style: {
					background: {
						gradient: {
							angle: 0,
							stops: [
								{ at: 0, color: "red" },
								{ at: 1, color: "blue" },
							],
						},
					},
				},
				children: [
					{
						type: "text",
						style: { font: { size: 20 } },
						text: "Proin in felis ut ante porttitor.",
					},
				],
			},
		],
		render: () => render(game.viewport, self, self.position),
	};
	return self;
};

game.entities = [
	Box({ x: 100, y: 100 }, LayoutDirection.Row),
	Box({ x: 100, y: 300 }, LayoutDirection.Column),
];

game.loop();
