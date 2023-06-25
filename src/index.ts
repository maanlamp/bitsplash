import { canvas } from "./canvas.js";
import { paint } from "./render.js";

const viewport = canvas({
	width: window.innerWidth,
	height: window.innerHeight,
});

window.addEventListener("resize", () => {
	viewport.canvas.width = window.innerWidth;
	viewport.canvas.height = window.innerHeight;
});

document.body.append(viewport.canvas);

// ============================================================

paint(
	{
		body: {
			type: "flex",
			style: { background: "red" },
			layout: {
				gap: 8,
				direction: "row",
				mainAxisAlignment: "space-between",
				crossAxisAlignment: "center",
				width: 850,
				height: 850,
			},
			children: [
				// {
				// 	type: "flex",
				// 	style: { background: "green" },
				// 	layout: { gap: 8 },
				// 	children: [
				// 		{
				// 			type: "text",
				// 			text: "Lorem",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "Ipsum",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "has",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "been",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "the",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "industry's",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "standard",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "for",
				// 		},
				// 		{
				// 			type: "text",
				// 			text: "decades.",
				// 		},
				// 	],
				// },
				{
					type: "flex",
					style: { background: "blue" },
					layout: { gap: 8, direction: "column" },
					children: [
						{
							type: "text",
							text: "Lorem",
						},
						{
							type: "text",
							text: "Ipsum",
						},
						{
							type: "text",
							text: "has",
						},
						{
							type: "text",
							text: "been",
						},
						{
							type: "text",
							text: "the",
						},
						{
							type: "text",
							text: "industry's",
						},
						{
							type: "text",
							text: "standard",
						},
						{
							type: "text",
							text: "for",
						},
						{
							type: "text",
							text: "decades.",
						},
					],
				},
				{
					type: "flex",
					style: { background: "blue" },
					layout: { gap: 8, direction: "column" },
					children: [
						{
							type: "text",
							text: "Lorem",
						},
						{
							type: "text",
							text: "Ipsum",
						},
						{
							type: "text",
							text: "has",
						},
						{
							type: "text",
							text: "been",
						},
						{
							type: "text",
							text: "the",
						},
						{
							type: "text",
							text: "industry's",
						},
						{
							type: "text",
							text: "standard",
						},
						{
							type: "text",
							text: "for",
						},
						{
							type: "text",
							text: "decades.",
						},
					],
				},
				{
					type: "flex",
					style: { background: "blue" },
					layout: { gap: 8, direction: "column" },
					children: [
						{
							type: "text",
							text: "Lorem",
						},
						{
							type: "text",
							text: "Ipsum",
						},
						{
							type: "text",
							text: "has",
						},
						{
							type: "text",
							text: "been",
						},
						{
							type: "text",
							text: "the",
						},
						{
							type: "text",
							text: "industry's",
						},
						{
							type: "text",
							text: "standard",
						},
						{
							type: "text",
							text: "for",
						},
						{
							type: "text",
							text: "decades.",
						},
					],
				},
			].sort(() => -1 + Math.round(Math.random() * 2)) as any[],
		},
	},
	viewport
);
