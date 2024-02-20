import { type ElementNode, type Node } from "./markup.js";
import { type Mouse } from "./render.js";

export type Position = Readonly<{
	x: number;
	y: number;
}>;

export const paint = (
	node: Node,
	position: Position,
	context: CanvasRenderingContext2D,
	mouse: Mouse
) => {
	context.save();
	// TODO: Mouse position is interpreted as global, but paint position
	// is interpreted as local, so either the "mouseIsInside" is wrong,
	// or we can't locally transform nodes (i.e. scale etc).
	// Currently, "mouseIsInside" is wrong.
	// We can get the current offset through
	// context.getTransform() and reading "e" and "f".
	// But it's not as easy as subtracting it once, since transformations
	// can be applied and restored at any point in the paint.
	const size = measure(node, context);
	const mouseIsInside =
		mouse.x > position.x &&
		mouse.x < position.x + size.w &&
		mouse.y > position.y &&
		mouse.y < position.y + size.h;

	if (typeof node === "string") {
		context.fillText(node, position.x, position.y + 8);
	} else {
		if (node.attributes.fill) {
			// Saving and restoring only fillStyle to preserve transformations
			const before = context.fillStyle;
			context.fillStyle =
				mouseIsInside && mouse[0] && node.attributes.click
					? node.attributes.click
					: node.attributes.fill;

			if (mouseIsInside && mouse[0]) {
				const scale = 0.9;
				context.translate(
					(size.w * (1 - scale)) / 2,
					(size.h * (1 - scale)) / 2
				);
				context.scale(scale, scale);
			}
			context.beginPath();
			context.roundRect(
				position.x,
				position.y,
				size.w,
				size.h,
				node.attributes.radius ?? 0
			);
			context.fill();
			context.fillStyle = before;
		}

		if (node.attributes.hover && mouseIsInside) {
			// TODO: Think of proper shorthand parsing strategy
			const [thickness, colour] = node.attributes.hover.split(" ");
			context.strokeStyle = colour;
			context.lineWidth = parseFloat(thickness);
			context.strokeRect(position.x, position.y, size.w, size.h);
		}

		if (node.attributes.color) {
			context.fillStyle = node.attributes.color;
		}

		switch (node.name) {
			case "game": {
				for (const child of node.children) {
					paint(child, position, context, mouse);
				}
				break;
			}
			case "box":
			case "row":
			case "column": {
				const padding = normalisePadding(node.attributes.padding);
				const origin = {
					x: position.x + padding.left,
					y: position.y + padding.top,
				};
				const positions = layout(node, context);
				for (const i in positions) {
					paint(
						node.children[i],
						{
							x: origin.x + positions[i].x,
							y: origin.y + positions[i].y,
						},
						context,
						mouse
					);
				}
				break;
			}
			default:
				throw new Error(`Cannot paint nodes of type "${node.name}".`);
		}
	}

	context.restore();
};

type Box<T> = Readonly<{
	top: T;
	right: T;
	bottom: T;
	left: T;
}>;

type Axes<T> = Readonly<{
	horizontal: T;
	vertical: T;
}>;

type Padding = number | Partial<Box<number> & Axes<number>>;

const normalisePadding = (padding: Padding | undefined): Box<number> => {
	if (!padding || typeof padding === "number")
		return {
			top: padding ?? 0,
			right: padding ?? 0,
			bottom: padding ?? 0,
			left: padding ?? 0,
		};

	return {
		top: padding.top ?? padding.vertical ?? 0,
		right: padding.right ?? padding.horizontal ?? 0,
		bottom: padding.bottom ?? padding.vertical ?? 0,
		left: padding.left ?? padding.horizontal ?? 0,
	};
};

export type Size = Readonly<{
	w: number;
	h: number;
}>;

const measure = (node: Node, context: CanvasRenderingContext2D): Size => {
	if (typeof node === "string") {
		const measurement = context.measureText(node);
		return {
			w: measurement.actualBoundingBoxLeft + measurement.actualBoundingBoxRight,
			h: measurement.fontBoundingBoxAscent + measurement.fontBoundingBoxDescent,
		};
	}

	const gap = parseFloat(node.attributes.gap ?? "0");
	const padding = normalisePadding(node.attributes.padding);
	switch (node.name) {
		case "game": {
			return {
				w: context.canvas.width,
				h: context.canvas.height,
			};
		}
		case "column": {
			const size = node.children.reduce(
				(acc, child) => {
					const size = measure(child, context);
					return { w: Math.max(acc.w, size.w), h: acc.h + size.h };
				},
				{ w: 0, h: 0 } as Size
			);
			return {
				w: node.attributes.width ?? size.w + padding.top + padding.bottom,
				h:
					node.attributes.height ??
					size.h +
						padding.left +
						padding.right +
						gap * Math.max(0, node.children.length - 1),
			};
		}
		case "row":
		case "box": {
			const size = node.children.reduce(
				(acc, child) => {
					const size = measure(child, context);
					return { w: acc.w + size.w, h: Math.max(acc.h, size.h) };
				},
				{ w: 0, h: 0 } as Size
			);
			return {
				w:
					node.attributes.width ??
					size.w +
						padding.top +
						padding.bottom +
						gap * Math.max(0, node.children.length - 1),
				h: node.attributes.height ?? size.h + padding.left + padding.right,
			};
		}
		default:
			throw new Error(`Cannot measure nodes of type "${node.name}".`);
	}
};

const layout = (
	node: ElementNode,
	context: CanvasRenderingContext2D
): ReadonlyArray<Position> => {
	const gap = parseFloat(node.attributes.gap ?? "0");
	const parentSize = measure(node, context);
	const parentPadding = normalisePadding(node.attributes.padding);
	const positions: Position[] = [];
	switch (node.name) {
		case "column": {
			let y = 0;
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				const size = measure(child, context);
				positions.push({
					x:
						node.attributes.alignCross === "end"
							? parentSize.w - parentPadding.left - parentPadding.right - size.w
							: node.attributes.alignCross === "center"
							? -parentPadding.left + parentSize.w / 2 - size.w / 2
							: 0,
					y,
				});
				y += size.h + gap;
			}
			return positions;
		}
		default: {
			let x = 0;
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				const size = measure(child, context);
				positions.push({
					y:
						node.attributes.alignCross === "end"
							? parentSize.h - parentPadding.top - parentPadding.bottom - size.h
							: node.attributes.alignCross === "center"
							? -parentPadding.top + parentSize.h / 2 - size.h / 2
							: 0,
					x,
				});
				x += size.w + gap;
			}
			return positions;
		}
	}
};
