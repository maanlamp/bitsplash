import makeGame from "./game.js";

// ============================================================

const img = new Image();
img.src = "https://i1.sndcdn.com/artworks-qboq5y833FMsteVT-tQdkzg-t500x500.jpg";

const game = makeGame({
	body: {
		type: "flex",
		style: {
			background: img,
		},
		layout: {
			gap: 16,
			direction: "column",
			mainAxisAlignment: "space-between",
			crossAxisAlignment: "center",
		},
		children: [
			{
				type: "flex",
				style: { background: "green" },
				layout: { gap: 8 },
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
				layout: { direction: "row", gap: 16 },
				children: [
					{
						type: "flex",
						style: { background: "rgba(0,0,255,.1)" },
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
						style: {
							background: "rgba(0,0,255,.1)",
							backdropFilter: { type: "blur", radius: 50 },
							cornerRadius: 16,
						},
						layout: { gap: 8, direction: "column", padding: 32 },
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
						style: { background: "rgba(0,0,255,.1)" },
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
				],
			},
		],
	},
});

game.loop();
