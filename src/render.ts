type Rect<T> = SideRect<T> | AxisRect<T>;

type SideRect<T> = {
	top: T;
	right: T;
	bottom: T;
	left: T;
};

type AxisRect<T> = {
	vertical: T;
	horizontal: T;
};

export type Widget = {
	width?: number;
	height?: number;
	padding?: Padding;
	gap?: number;
	direction?: LayoutDirection;
	mainAxisAlignment?: MainAxisAlignment;
	crossAxisAlignment?: CrossAxisAlignment;
	children?: Renderable[];
	scroll?: Partial<AxisRect<number>>;
	background?: string | HTMLImageElement;
	wrap?: boolean;
};

type MainAxisAlignment = "start" | "centre" | "space-between" | "end";

type CrossAxisAlignment = "start" | "centre" | "end";

type Padding = Rect<number> | number;

type LayoutDirection = "column" | "row";

export type Renderable = string | Widget | HTMLImageElement;

type BoundingBox = { width: number; height: number };

const DEFAULT_CANVAS_FONT_SIZE = 10;

const normalisePadding = (padding?: Padding): SideRect<number> => {
	if (!padding) return { top: 0, right: 0, bottom: 0, left: 0 };

	if (typeof padding === "number")
		return { top: padding, right: padding, bottom: padding, left: padding };

	const newPadding: Partial<SideRect<number>> = {};
	if ((padding as AxisRect<number>).horizontal) {
		newPadding.left = newPadding.right = (
			padding as AxisRect<number>
		).horizontal;
	}
	if ((padding as AxisRect<number>).vertical) {
		newPadding.top = newPadding.bottom = (padding as AxisRect<number>).vertical;
	}
	if ((padding as SideRect<number>).top) {
		newPadding.top = (padding as SideRect<number>).top;
	}
	if ((padding as SideRect<number>).right) {
		newPadding.right = (padding as SideRect<number>).right;
	}
	if ((padding as SideRect<number>).bottom) {
		newPadding.bottom = (padding as SideRect<number>).bottom;
	}
	if ((padding as SideRect<number>).left) {
		newPadding.left = (padding as SideRect<number>).left;
	}

	return newPadding as SideRect<number>;
};

const getFontSize = (context: CanvasRenderingContext2D) => {
	const fontSizeString = context.font.match(/(\d+)px/)?.[1];
	return fontSizeString ? Number(fontSizeString) : DEFAULT_CANVAS_FONT_SIZE;
};

export const measure = (
	context: CanvasRenderingContext2D,
	renderable: Renderable,
	constraints?: BoundingBox
): BoundingBox => {
	if (typeof renderable === "string") {
		return measureText(context, renderable, constraints);
	} else if (renderable.constructor === HTMLImageElement) {
		return measureImage(renderable, constraints);
	}
	return measureWidget(context, renderable as Widget, constraints);
};

const measureText = (
	context: CanvasRenderingContext2D,
	text: string,
	constraints?: BoundingBox
): BoundingBox => {
	const lines = wrapText(context, text, constraints?.width);
	const width = lines.reduce(
		(widest, line) => Math.max(context.measureText(line).width, widest),
		0
	);
	const height = lines.length * (getFontSize(context) * 1.33) - 3;
	return { width, height };
};

const measureWidget = (
	context: CanvasRenderingContext2D,
	widget: Widget,
	constraints?: BoundingBox
): BoundingBox => {
	const padding = normalisePadding(widget.padding);
	const direction = widget.direction ?? "row";
	let mainAxis = 0;
	let crossAxis = 0;
	if (widget.children) {
		for (const child of widget.children) {
			const composedConstraints = minBounds(constraints, {
				width: (widget.width ?? Infinity) - padding.left - padding.right,
				height: (widget.height ?? Infinity) - padding.top - padding.bottom,
			});
			const bounds = measure(context, child, composedConstraints);
			mainAxis += direction === "column" ? bounds.height : bounds.width;
			crossAxis = Math.max(
				crossAxis,
				direction === "column" ? bounds.width : bounds.height
			);
		}
	}
	return {
		width:
			padding.left +
			(direction === "column" ? crossAxis : mainAxis) +
			padding.right +
			(direction === "column"
				? 0
				: (widget.gap ?? 0) * ((widget.children?.length ?? 1) - 1)),
		height:
			padding.top +
			(direction === "column" ? mainAxis : crossAxis) +
			padding.bottom +
			(direction === "column"
				? (widget.gap ?? 0) * ((widget.children?.length ?? 1) - 1)
				: 0),
	};
};

const measureImage = (
	image: HTMLImageElement,
	constraints?: BoundingBox
): BoundingBox => minBounds(image, constraints);

export const render = (
	context: CanvasRenderingContext2D,
	renderable: Renderable,
	x: number,
	y: number,
	constraints?: BoundingBox
) => {
	if (typeof renderable === "string") {
		return renderText(context, renderable, x, y, constraints);
	} else if (renderable.constructor === HTMLImageElement) {
		return renderImage(context, renderable, x, y, constraints);
	}
	renderWidget(context, renderable as Widget, x, y, constraints);
};

const renderText = (
	context: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	constraints?: BoundingBox
) => {
	const lines = wrapText(context, text, constraints?.width);
	const fontSize = getFontSize(context);
	for (let i = 0; i < lines.length; i++) {
		context.fillText(lines[i]!, x, y + fontSize + i * (fontSize * 1.33) - 1);
	}
};

const minBounds = (
	a: BoundingBox | undefined,
	b: BoundingBox | undefined
): BoundingBox => {
	if (!a) return b ?? { width: Infinity, height: Infinity };
	if (!b) return a ?? { width: Infinity, height: Infinity };
	return {
		width: Math.min(a.width, b.width),
		height: Math.min(a.height, b.height),
	};
};

const renderWidget = (
	context: CanvasRenderingContext2D,
	widget: Widget,
	x: number,
	y: number,
	constraints?: BoundingBox
) => {
	const parentPadding = normalisePadding(widget.padding);
	const direction = widget.direction ?? "row";
	const mainAxisAlignment = widget.mainAxisAlignment ?? "start";
	const crossAxisAlignment = widget.crossAxisAlignment ?? "start";
	const preferred = measure(context, widget, {
		width:
			(constraints?.width ?? Infinity) -
			parentPadding.left -
			parentPadding.right,
		height:
			(constraints?.height ?? Infinity) -
			parentPadding.top -
			parentPadding.bottom,
	});
	const size = {
		width: widget.width ?? preferred.width,
		height: widget.height ?? preferred.height,
	};
	if (widget.background)
		renderBackground(context, widget.background, x, y, size);

	context.save();
	context.beginPath();
	context.rect(x, y, size.width, size.height);
	context.clip();
	context.closePath();
	let offset = 0;
	// TODO: Take axis alignments into account
	if (widget.children) {
		const contentBounds = minBounds(
			{
				width: size.width - parentPadding.left - parentPadding.right,
				height: size.height - parentPadding.top - parentPadding.bottom,
			},
			constraints
		);
		for (const child of widget.children) {
			render(
				context,
				child,
				x +
					(widget.scroll?.horizontal ?? 0) +
					parentPadding.left +
					(direction === "row" ? offset : 0),
				y +
					(widget.scroll?.vertical ?? 0) +
					parentPadding.top +
					(direction === "row" ? 0 : offset),
				contentBounds
			);
			const bounds = measure(context, child, contentBounds);
			offset +=
				(direction === "column" ? bounds.height : bounds.width) +
				(widget.gap ?? 0);
		}
	}
	context.restore();

	if (preferred.height > size.height) {
		const scrollScale = size.height / preferred.height;
		context.fillStyle = "white";
		context.fillRect(x + size.width - 8, 4 + y, 4, 4);
		context.fillRect(x + size.width - 6.5, 4 + y, 1, size.height - 12);
		context.fillRect(x + size.width - 8, -8 + y + size.height, 4, 4);
		context.fillRect(
			x + size.width - 8,
			10 + y + scrollScale * -(widget.scroll?.vertical ?? 0),
			4,
			-20 + scrollScale * size.height
		);
	}

	if (preferred.width > size.width) {
		const scrollScale = size.width / preferred.width;
		context.fillStyle = "white";
		context.fillRect(x + 4, -8 + y + size.height, 4, 4);
		context.fillRect(x + 4, -6.5 + y + size.height, size.width - 12, 1);
		context.fillRect(x + size.width - 8, -8 + y + size.height, 4, 4);
		context.fillRect(
			10 + x + scrollScale * -(widget.scroll?.horizontal ?? 0),
			y + size.height - 8,
			-20 + scrollScale * size.width,
			4
		);
	}
};

const renderBackground = (
	context: CanvasRenderingContext2D,
	background: Widget["background"],
	x: number,
	y: number,
	size: BoundingBox
) => {
	context.save();
	if (typeof background === "string") {
		context.fillStyle = background;
		context.fillRect(x, y, size.width, size.height);
	} else {
		throw "Not implemented.";
	}
	context.restore();
};

const renderImage = (
	context: CanvasRenderingContext2D,
	image: HTMLImageElement,
	x: number,
	y: number,
	constraints?: BoundingBox
) => {
	throw "Not implemented.";
};

const wrapText = (
	context: CanvasRenderingContext2D,
	text: string,
	maxWidth: number = Infinity
) => {
	const words = text
		.split(/[\r\f\v\t ]+/)
		.flatMap(word => word.split(/(\n)/))
		.filter(Boolean);
	const spaceWidth = context.measureText(" ").width;
	const lines: string[][] = [[]];
	let lineWidth = 0;
	for (const word of words) {
		if (word === "\n") {
			lines.push([]);
			lineWidth = 0;
			continue;
		}
		const { width } = context.measureText(word);
		lineWidth += width + spaceWidth * (lineWidth === 0 ? 0 : 1);
		if (lineWidth > maxWidth && lines[lines.length - 1]!.length !== 0) {
			lines.push([]);
			lineWidth = width;
		}
		lines[lines.length - 1]!.push(word);
	}
	return lines.map(line => line.join(" "));
};
