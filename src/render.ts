import { Size } from "./canvas.js";

type Image = {
	type: "image";
	image: HTMLImageElement;
};

type Flex = {
	type: "flex";
	layout?: Partial<FlexLayout>;
	style?: Partial<FlexStyle>;
	children?: Node[];
};

type FlexLayout = {
	direction: "column" | "row";
	gap: number;
	mainAxisAlignment: "start" | "center" | "end" | "space-between";
	crossAxisAlignment: "start" | "center" | "end";
	width: number;
	height: number;
	padding: number | Rect<number>;
};

type Rect<T> = AxisRect<T> | SideRect<T>;

type AxisRect<T> = {
	vertical: T;
	horizontal: T;
};

type SideRect<T> = {
	top: T;
	right: T;
	bottom: T;
	left: T;
};

type CornerRect<T> = {
	topLeft: T;
	topRight: T;
	bottomRight: T;
	bottomLeft: T;
};

type FlexStyle = {
	background: Background;
	backdropFilter: BlurFilter;
	cornerRadius: number | Partial<CornerRect<number>>;
};

type BlurFilter = {
	type: "blur";
	radius: number;
};

type Background = string | HTMLImageElement | Gradient;

type Gradient = LinearGradient | RadialGradient | ConicGradient;

type LinearGradient = {
	type: "linear";
	direction?: number;
	stops: GradientStop[];
};

type RadialGradient = {
	type: "radial";
	direction?: number;
	stops: GradientStop[];
};

type ConicGradient = {
	type: "conic";
	direction?: number;
	stops: GradientStop[];
};

type GradientStop =
	| string
	| {
			offset: number;
			color: string;
	  };

type Text = {
	type: "text";
	text: string;
	style?: Partial<TextStyle>;
};

type TextStyle = {
	color: string;
	fontFamily: string;
	size: number;
};

type Element = Image | Flex;

type Node = Text | Element;

const measure = (node: Node, context: CanvasRenderingContext2D) => {
	switch (node.type) {
		case "text":
			return measureText(node, context);
		case "image":
			return measureImage(node, context);
		case "flex":
			return measureFlex(node, context);
		default:
			throw new Error(`Unhandled measurable type "${(node as any).type}".`);
	}
};

const measureText = (text: Text, context: CanvasRenderingContext2D) => {
	context.save();
	context.fillStyle = text.style?.color ?? "black";
	const fontFamily = text.style?.fontFamily ?? "sans-serif";
	const fontSize = text.style?.size ?? 20;
	context.font = fontSize + "px " + fontFamily;
	const measured = context.measureText(text.text);
	context.restore();
	return {
		width: measured.width,
		height: measured.fontBoundingBoxAscent + measured.fontBoundingBoxDescent,
	};
};

const measureImage = (image: Image, context: CanvasRenderingContext2D) => {
	return { width: image.image.width, height: image.image.height };
};

const measureFlex = (flex: Flex, context: CanvasRenderingContext2D) => {
	const padding = normalisePadding(flex.layout?.padding);
	const direction = flex.layout?.direction ?? "row";
	const gap = flex.layout?.gap ?? 0;
	let mainAxisSize = 0;
	let crossAxisSize = 0;

	if (flex.children) {
		const childCount = flex.children.length;
		for (let i = 0; i < childCount; i++) {
			const child = flex.children[i]!;
			const size = measure(child, context);
			if (direction === "row") {
				mainAxisSize += size.width;
				crossAxisSize = Math.max(crossAxisSize, size.height);
				if (i !== childCount - 1) mainAxisSize += gap;
			} else {
				mainAxisSize += size.height;
				crossAxisSize = Math.max(crossAxisSize, size.width);
				if (i !== childCount - 1) mainAxisSize += gap;
			}
		}
	}

	if (direction === "row") {
		return {
			width: mainAxisSize + padding.horizontal,
			height: crossAxisSize + padding.vertical,
		};
	} else {
		return {
			width: crossAxisSize + padding.horizontal,
			height: mainAxisSize + padding.vertical,
		};
	}
};

const render = (
	node: Node,
	context: CanvasRenderingContext2D,
	x: number,
	y: number
) => {
	switch (node.type) {
		case "text":
			return renderText(node, context, x, y);
		case "image":
			return renderImage(node, context, x, y);
		case "flex":
			return renderFlex(node, context, x, y);
		default:
			throw new Error(`Unhandled renderable type "${(node as any).type}".`);
	}
};

const renderText = (
	text: Text,
	context: CanvasRenderingContext2D,
	x: number,
	y: number
) => {
	context.save();
	context.fillStyle = text.style?.color ?? "black";
	const fontFamily = text.style?.fontFamily ?? "sans-serif";
	const fontSize = text.style?.size ?? 20;
	context.font = fontSize + "px " + fontFamily;
	context.fillText(text.text, x, y + fontSize);
	context.restore();
};

const renderImage = (
	image: Image,
	context: CanvasRenderingContext2D,
	x: number,
	y: number
) => {
	context.save();
	context.drawImage(image.image, x, y);
	context.restore();
};

const normaliseRadius = (radius: FlexStyle["cornerRadius"] | undefined) => {
	if (typeof radius === "number") return [radius, radius, radius, radius];
	return [
		radius?.topLeft ?? 0,
		radius?.topRight ?? 0,
		radius?.bottomRight ?? 0,
		radius?.bottomLeft ?? 0,
	];
};

const normalisePadding = (
	padding: FlexLayout["padding"] | undefined
): AxisRect<number> & SideRect<number> => {
	if (!padding)
		return {
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
			vertical: 0,
			horizontal: 0,
		};
	if (typeof padding === "number")
		return {
			top: padding,
			right: padding,
			bottom: padding,
			left: padding,
			vertical: padding * 2,
			horizontal: padding * 2,
		};
	const rect = {
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		vertical: 0,
		horizontal: 0,
	};
	if ((padding as AxisRect<number>).vertical) {
		rect.top = (padding as AxisRect<number>).vertical;
		rect.bottom = (padding as AxisRect<number>).vertical;
	}
	if ((padding as AxisRect<number>).horizontal) {
		rect.left = (padding as AxisRect<number>).horizontal;
		rect.right = (padding as AxisRect<number>).horizontal;
	}
	if ((padding as SideRect<number>).top) {
		rect.top = (padding as SideRect<number>).top;
	}
	if ((padding as SideRect<number>).right) {
		rect.right = (padding as SideRect<number>).right;
	}
	if ((padding as SideRect<number>).bottom) {
		rect.bottom = (padding as SideRect<number>).bottom;
	}
	if ((padding as SideRect<number>).left) {
		rect.left = (padding as SideRect<number>).left;
	}
	rect.vertical = rect.top + rect.bottom;
	rect.horizontal = rect.left + rect.right;
	return rect;
};

const renderFlex = (
	flex: Flex,
	context: CanvasRenderingContext2D,
	x: number,
	y: number
) => {
	context.save();

	const { width, height } = { ...measure(flex, context), ...flex.layout };
	const padding = normalisePadding(flex.layout?.padding);
	const radii = normaliseRadius(flex.style?.cornerRadius);

	if (flex.style?.backdropFilter) {
		context.save();
		switch (flex.style.backdropFilter.type) {
			case "blur": {
				const radius = flex.style.backdropFilter.radius ?? 0;
				context.filter = `blur(${radius}px)`;
				context.beginPath();
				context.roundRect(x, y, width, height, ...radii);
				context.clip();
				context.drawImage(context.canvas, 0, 0);
				break;
			}
			default:
				throw new Error(
					`Unhandled backdrop filter "${flex.style.backdropFilter.type}".`
				);
		}
		context.restore();
	}

	if (flex.style?.background) {
		context.beginPath();
		context.roundRect(x, y, width, height, ...radii);
		context.clip();
		renderBackground(flex.style.background, context, x, y, width, height);
	}

	const direction = flex.layout?.direction ?? "row";
	const gap = flex.layout?.gap ?? 0;
	let mainAxisSize = 0;
	let crossAxisSize = 0;
	if (flex.children) {
		const childCount = flex.children.length;
		const alignments: [number, Size][] = [];
		for (let i = 0; i < childCount; i++) {
			const child = flex.children[i]!;
			const size = measure(child, context);
			alignments.push([mainAxisSize, size]);
			if (direction === "row") {
				mainAxisSize += size.width;
				crossAxisSize = Math.max(crossAxisSize, size.height);
			} else {
				mainAxisSize += size.height;
				crossAxisSize = Math.max(crossAxisSize, size.width);
			}
			if (i !== childCount - 1) mainAxisSize += gap;
		}

		const mainAxisAlignment = flex.layout?.mainAxisAlignment ?? "start";
		const crossAxisAlignment = flex.layout?.crossAxisAlignment ?? "start";
		for (let i = 0; i < childCount; i++) {
			const child = flex.children[i]!;
			const [mainAxisOffset, size] = alignments[i]!;
			const [lastOffset, lastSize] = alignments[childCount - 1]!;
			const contentSize = alignments.reduce(
				(total, [, size]) => ({
					width: total.width + size.width,
					height: total.height + size.height,
				}),
				{ width: 0, height: 0 }
			);
			if (direction === "row") {
				const mainAxisAlignments: Record<
					FlexLayout["mainAxisAlignment"],
					number
				> = {
					start: mainAxisOffset,
					center:
						mainAxisOffset + width / 2 - (lastOffset + lastSize.width) / 2,
					end: width - (lastOffset + lastSize.width) + mainAxisOffset,
					"space-between":
						mainAxisOffset +
						((width - contentSize.width) / (childCount - 1) - gap) * i,
				};
				const crossAxisAlignments: Record<
					FlexLayout["crossAxisAlignment"],
					number
				> = {
					start: 0,
					center: height / 2 - size.height / 2,
					end: height - size.height,
				};
				render(
					child,
					context,
					x + mainAxisAlignments[mainAxisAlignment] + padding.left,
					y + crossAxisAlignments[crossAxisAlignment] + padding.top
				);
			} else {
				const mainAxisAlignments: Record<
					FlexLayout["mainAxisAlignment"],
					number
				> = {
					start: mainAxisOffset,
					center:
						mainAxisOffset + height / 2 - (lastOffset + lastSize.height) / 2,
					end: height - (lastOffset + lastSize.height) + mainAxisOffset,
					"space-between":
						mainAxisOffset +
						((height - contentSize.height) / (childCount - 1) - gap) * i,
				};
				const crossAxisAlignments: Record<
					FlexLayout["crossAxisAlignment"],
					number
				> = {
					start: 0,
					center: width / 2 - size.width / 2,
					end: width - size.width,
				};
				render(
					child,
					context,
					x + crossAxisAlignments[crossAxisAlignment] + padding.left,
					y + mainAxisAlignments[mainAxisAlignment] + padding.top
				);
			}
		}
	}

	context.restore();
};

const isImage = (x: any): x is HTMLImageElement =>
	x.constructor === HTMLImageElement;

const renderBackground = (
	background: Background,
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number
) => {
	context.save();
	if (typeof background === "string") {
		// color
		context.fillStyle = background;
		context.fillRect(x, y, width, height);
	} else if (isImage(background)) {
		// image
		context.drawImage(background, x, y, width, height);
	} else {
		// gradient
		const direction = background.direction ?? 0;
		switch (background.type) {
			case "linear": {
				const gradient = context.createLinearGradient(0, 0, width, 0);
				const stopCount = background.stops.length;
				for (let i = 0; i < stopCount; i++) {
					const stop = background.stops[i]!;
					if (typeof stop === "string") {
						gradient.addColorStop(
							((width / (stopCount - 1)) * i) / width,
							stop
						);
					} else {
						gradient.addColorStop(stop.offset, stop.color);
					}
				}
				// TODO: Implement background gradient rotation
				// context.translate(width / 2, height / 2);
				// context.rotate(direction);
				// Check distance between square center and intersection of ray along angle
				// const rotationCompensationScale = 1.4142135623730951;
				// context.scale(rotationCompensationScale, rotationCompensationScale);
				// context.translate(-(width / 2), -(height / 2));
				context.fillStyle = gradient;
				context.fillRect(x, y, width, height);
				break;
			}
			case "radial": {
				break;
			}
			case "conic": {
				break;
			}
			default:
				throw new Error(
					`Unhandled gradient type "${(background as any).type}".`
				);
		}
	}
	context.restore();
};

export type Document = {
	body: Node;
};

export const paint = (
	document: Document,
	viewport: CanvasRenderingContext2D
) => {
	viewport.fillStyle = "white";
	viewport.fillRect(0, 0, viewport.canvas.width, viewport.canvas.height);
	render(document.body, viewport, 0, 0);
};
