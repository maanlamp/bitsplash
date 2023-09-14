import { ElementNode, type Node } from "./markup";

type Position = Readonly<{
	x: number;
	y: number;
}>;

export const paint = (
	node: Node,
	position: Position,
	context: CanvasRenderingContext2D
) => {
	if (typeof node === "string")
		return context.fillText(node, position.x, position.y + 8);

	const size = measure(node, context);
	switch (node.name) {
		case "box":
		case "row":
		case "column": {
			if (node.attributes.fill) {
				context.save();
				context.fillStyle = node.attributes.fill;
				context.beginPath();
				context.roundRect(
					position.x,
					position.y,
					size.w,
					size.h,
					node.attributes.radius ?? 0
				);
				context.fill();
				context.restore();
			}
			if (node.attributes.color) {
				context.fillStyle = node.attributes.color;
			}

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
					context
				);
			}

			break;
		}
		default:
			throw new Error(`Cannot paint nodes of type "${node.name}".`);
	}
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

type Size = Readonly<{
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

	const padding = normalisePadding(node.attributes.padding);
	switch (node.name) {
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
				h: node.attributes.height ?? size.h + padding.left + padding.right,
			};
		}
		default: {
			const size = node.children.reduce(
				(acc, child) => {
					const size = measure(child, context);
					return { w: acc.w + size.w, h: Math.max(acc.h, size.h) };
				},
				{ w: 0, h: 0 } as Size
			);
			return {
				w: node.attributes.width ?? size.w + padding.top + padding.bottom,
				h: node.attributes.height ?? size.h + padding.left + padding.right,
			};
		}
	}
};

const layout = (
	node: ElementNode,
	context: CanvasRenderingContext2D
): ReadonlyArray<Position> => {
	switch (node.name) {
		case "column": {
			const parentSize = measure(node, context);
			const parentPadding = normalisePadding(node.attributes.padding);
			const positions: Position[] = [];
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
				y += size.h;
			}
			return positions;
		}
		default: {
			const parentSize = measure(node, context);
			const parentPadding = normalisePadding(node.attributes.padding);
			const positions: Position[] = [];
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
				x += size.w;
			}
			return positions;
		}
	}
};
