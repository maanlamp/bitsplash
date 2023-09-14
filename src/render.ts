import { type Node as MarkupNode } from "./markup";
import { paint } from "./paint";

export const render = (node: MarkupNode): Node => {
	if (typeof node === "string") return document.createTextNode(node);

	switch (node.name) {
		case "game": {
			const canvas = document.createElement("canvas");
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Unable to get context.");
			if (node.attributes.fill) {
				context.save();
				context.fillStyle = node.attributes.fill;
				context.fillRect(0, 0, canvas.width, canvas.height);
				context.restore();
			}
			for (const child of node.children) paint(child, { x: 0, y: 0 }, context);
			return canvas;
		}
		default:
			return create(node);
	}
};

const create = <T extends HTMLElement>(node: Exclude<MarkupNode, string>) => {
	const element = document.createElement(node.name) as T;
	for (const [name, value] of Object.entries(node.attributes))
		element.setAttribute(name, value);
	for (const child of node.children) element.append(render(child));
	return element;
};
