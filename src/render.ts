import { type Node as MarkupNode } from "./markup.js";
import { paint } from "./paint.js";

export type Mouse = { x: number; y: number; [button: number]: boolean };

export const render = (node: MarkupNode): Node => {
	if (typeof node === "string") return document.createTextNode(node);

	switch (node.name) {
		case "program": {
			return render(node.children[0]);
		}
		case "game": {
			const canvas = document.createElement("canvas");
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Unable to get context.");

			canvas.tabIndex = 0;
			canvas.addEventListener("contextmenu", e => {
				e.preventDefault();
			});

			let mouse: Mouse = {
				x: -Infinity,
				y: -Infinity,
			};
			let keys: Record<string, boolean> = {};
			const origin = { x: 0, y: 0 };
			const repaint = (e?: MouseEvent) => {
				e?.preventDefault();
				if (e) {
					mouse[e.button] =
						e.type === "mousedown"
							? true
							: e.type === "mouseup"
							? false
							: mouse[e.button];
				}
				mouse.x = e?.clientX ?? mouse.x;
				mouse.y = e?.clientY ?? mouse.y;
				requestAnimationFrame(() => {
					paint(node, origin, context, mouse);
				});
			};
			canvas.addEventListener("mousemove", repaint);
			canvas.addEventListener("mouseenter", repaint);
			canvas.addEventListener("mouseleave", repaint);
			canvas.addEventListener("wheel", repaint);
			canvas.addEventListener("mousedown", repaint);
			canvas.addEventListener("mouseup", repaint);

			setTimeout(() => {
				const size = canvas.parentElement?.getBoundingClientRect();
				if (!size) return;
				canvas.width = size.width;
				canvas.height = size.height;
				repaint();

				const handleKey = (e: KeyboardEvent) => {
					if (document.activeElement !== canvas || e.repeat) return;
					keys[e.key.toUpperCase()] = e.type === "keydown";
					repaint();
				};

				window.addEventListener("keyup", handleKey);
				window.addEventListener("keydown", handleKey);
				canvas.addEventListener("click", () => canvas.focus());
			});

			return canvas;
		}
		default:
			return create(node);
	}
};

const create = <T extends HTMLElement>(node: Exclude<MarkupNode, string>) => {
	const element = document.createElement(node.name) as T;
	for (const [name, value] of Object.entries(node.attributes)) {
		element.setAttribute(name, value);
	}
	for (const child of node.children) {
		element.append(render(child));
	}
	return element;
};
