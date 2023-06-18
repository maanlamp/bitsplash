import { Entity } from "./entity.js";
import game from "./game.js";
import { loadImage } from "./image.js";
import {
	CrossAxisAlignment,
	LayoutDirection,
	Renderable,
	render,
} from "./render.js";

const img = await loadImage(
	"https://i1.sndcdn.com/artworks-qboq5y833FMsteVT-tQdkzg-t500x500.jpg"
);
const rocket = await loadImage("/src/rocket.svg");

rocket.width = rocket.height = 32;

const Box = (
	direction: LayoutDirection,
	crossAxisAlignment: CrossAxisAlignment
) => {
	const self: Renderable = {
		id: crypto.randomUUID(),
		type: "box",
		style: { background: "rgb(200,200,200)", border: { radius: 8 } },
		layout: {
			gap: 32,
			direction: direction,
			padding: 16,
			crossAxisAlignment,
		},
		children: [
			{
				id: crypto.randomUUID(),
				type: "box",
				style: {
					background: { image: img },
					border: {
						radius: {
							topLeft: 32,
							bottomLeft: 2,
							topRight: 8,
							bottomRight: 16,
						},
					},
				},
				layout: { padding: 32 },
				children: [
					{
						id: crypto.randomUUID(),
						type: "text",
						style: { colour: "white", font: { size: 12 } },
						text: "Lorem ipsum dolor sit amet.",
					},
				],
			},
			{
				id: crypto.randomUUID(),
				type: "image",
				image: rocket,
			},
			{
				id: crypto.randomUUID(),
				type: "text",
				style: { font: { size: 16 } },
				text: "Consectetur adipiscing elit.",
			},
			{
				id: crypto.randomUUID(),
				type: "box",
				layout: { padding: 4 },
				style: {
					border: { radius: 32 },
					background: {
						gradient: {
							angle: 0,
							stops: [
								{ offset: 0, color: "rgba(255,0,0,.33)" },
								{ offset: 1, color: "rgba(255,0,0,0)" },
							],
						},
					},
				},
				children: [
					{
						id: crypto.randomUUID(),
						type: "text",
						style: { font: { size: 20 } },
						text: "Proin in felis ut ante porttitor.",
					},
				],
			},
		],
	};
	return self;
};

game.entities = [
	{
		id: crypto.randomUUID(),
		position: { x: 32, y: 100 },
		type: "box",
		layout: { direction: LayoutDirection.Column, gap: 64 },
		children: [
			{
				id: crypto.randomUUID(),
				type: "box",
				layout: { direction: LayoutDirection.Column, gap: 16 },
				children: [
					Box(LayoutDirection.Row, CrossAxisAlignment.Start),
					Box(LayoutDirection.Row, CrossAxisAlignment.Centre),
					Box(LayoutDirection.Row, CrossAxisAlignment.End),
				],
			},
			{
				id: crypto.randomUUID(),
				type: "box",
				layout: { direction: LayoutDirection.Row, gap: 16 },
				children: [
					Box(LayoutDirection.Column, CrossAxisAlignment.Start),
					Box(LayoutDirection.Column, CrossAxisAlignment.Centre),
					Box(LayoutDirection.Column, CrossAxisAlignment.End),
				],
			},
		],
		render: () =>
			render(
				game.viewport,
				game.entities[0] as any as Renderable,
				game.entities[0]!.position
			),
	} as Renderable & Entity,
];

game.loop();
