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
			const positions = layout(
				node,
				{
					x: position.x + padding.left,
					y: position.y + padding.top,
				},
				context
			);
			for (const i in positions) {
				paint(node.children[i], positions[i], context);
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
	position: Position,
	context: CanvasRenderingContext2D
): ReadonlyArray<Position> => {
	switch (node.name) {
		case "column":
			return node.children.slice(1).reduce(
				(positions, child, i) => {
					const size = measure(child, context);
					return positions.concat({
						x: position.x,
						y: positions[i].y + size.h,
					});
				},
				[position]
			);
		default:
			return node.children.slice(1).reduce(
				(positions, child, i) => {
					const size = measure(child, context);
					return positions.concat({
						x: positions[i].x + size.w,
						y: position.y,
					});
				},
				[position]
			);
	}
};
