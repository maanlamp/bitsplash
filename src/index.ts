import { Entity } from "./entity.js";
import game from "./game.js";
import {
	CrossAxisAlignment,
	LayoutDirection,
	Renderable,
	render,
} from "./render.js";
import { Point } from "./util.js";

const img = new Image();
img.src = "https://i1.sndcdn.com/artworks-qboq5y833FMsteVT-tQdkzg-t500x500.jpg";

const Box = (
	position: Point,
	direction: LayoutDirection,
	crossAxisAlignment: CrossAxisAlignment
) => {
	const self: Renderable & Entity = {
		id: crypto.randomUUID(),
		type: "box",
		position,
		style: { background: "rgb(200,200,200)" },
		layout: {
			gap: 32,
			direction: direction,
			padding: 16,
			crossAxisAlignment,
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
				layout: { padding: { vertical: 8, left: 2, right: 128 } },
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
								{ at: 0, color: "rgba(255,0,0,.33)" },
								{ at: 1, color: "rgba(255,0,0,0)" },
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
	Box({ x: 100, y: 100 }, LayoutDirection.Row, CrossAxisAlignment.Start),
	Box({ x: 100, y: 200 }, LayoutDirection.Row, CrossAxisAlignment.Centre),
	Box({ x: 100, y: 300 }, LayoutDirection.Row, CrossAxisAlignment.End),
	Box({ x: 100, y: 500 }, LayoutDirection.Column, CrossAxisAlignment.Start),
	Box({ x: 400, y: 500 }, LayoutDirection.Column, CrossAxisAlignment.Centre),
	Box({ x: 700, y: 500 }, LayoutDirection.Column, CrossAxisAlignment.End),
];

game.loop();
