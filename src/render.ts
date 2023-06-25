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
};

type FlexStyle = {
	background: string;
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
			throw new Error(`Cannot measure node of type "${(node as any).type}".`);
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
		return { width: mainAxisSize, height: crossAxisSize };
	} else {
		return { width: crossAxisSize, height: mainAxisSize };
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
			throw new Error(`Cannot render node of type "${(node as any).type}".`);
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

const renderFlex = (
	flex: Flex,
	context: CanvasRenderingContext2D,
	x: number,
	y: number
) => {
	context.save();

	const { width, height } = { ...measure(flex, context), ...flex.layout };

	if (flex.style?.background) {
		context.fillStyle = flex.style.background;
		context.beginPath();
		context.rect(x, y, width, height);
		context.fill();
		context.clip();
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
					x + mainAxisAlignments[mainAxisAlignment],
					y + crossAxisAlignments[crossAxisAlignment]
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
					x + crossAxisAlignments[crossAxisAlignment],
					y + mainAxisAlignments[mainAxisAlignment]
				);
			}
		}
	}

	context.restore();
};

type Document = {
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
