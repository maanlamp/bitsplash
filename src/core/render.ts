import { ElementNode, type Node as MarkupNode } from "./markup.js";
import { paint } from "./paint.js";

export type Mouse = { x: number; y: number; [button: number]: boolean };

export const render = (node: MarkupNode): Node | ReadonlyArray<Node> | null => {
	if (typeof node === "string") {
		return document.createTextNode(node);
	} else if (typeof node === "function") {
		return render(node());
	} else if (!node) {
		return null;
	} else if (Array.isArray(node)) {
		return node.map(render).flat() as ReadonlyArray<Node>;
	}

	node = node as ElementNode;
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
					context.clearRect(0, 0, canvas.width, canvas.height);
					paint(node, origin, context, mouse);
				});
			};
			canvas.addEventListener("mousemove", repaint);
			canvas.addEventListener("mouseenter", repaint);
			canvas.addEventListener("mouseleave", repaint);
			canvas.addEventListener("wheel", repaint);
			canvas.addEventListener("mousedown", repaint);
			canvas.addEventListener("mouseup", repaint);

			const resize = () => {
				const size = canvas.parentElement?.getBoundingClientRect();
				if (!size) return;
				canvas.width = size.width;
				canvas.height = size.height;
				repaint();
			};

			window.addEventListener("resize", resize);

			// Safely add some listeners to the canvas when it's actually rendered
			const observer = new MutationObserver(mutations => {
				for (const mut of mutations) {
					if (Array.from(mut.addedNodes).some(node => node === canvas)) {
						const handleKey = (e: KeyboardEvent) => {
							if (document.activeElement !== canvas || e.repeat) return;
							keys[e.key.toUpperCase()] = e.type === "keydown";
							repaint();
						};

						window.addEventListener("keyup", handleKey);
						window.addEventListener("keydown", handleKey);
						canvas.addEventListener("click", () => canvas.focus());

						resize();
						observer.disconnect();
					}
				}
			});
			observer.observe(document, {
				childList: true,
				subtree: true,
			});

			return canvas;
		}
		default:
			return create(node);
	}
};

const create = <T extends HTMLElement>(node: ElementNode) => {
	const element = document.createElement(node.name) as T;
	for (const [name, value] of Object.entries(node.attributes)) {
		element.setAttribute(name, value);
	}
	for (const child of node.children) {
		const rendered = render(child);
		if (!rendered) continue;
		for (const e of [element].flat()) element.append(e);
	}
	return element;
};
