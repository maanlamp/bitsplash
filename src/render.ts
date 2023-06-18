import { AxisRect, Point, Rect, SideRect, Size } from "./util.js";

type Text = {
	type: "text";
	text: string;
	layout?: Partial<TextLayout>;
	style?: Partial<TextStyle>;
};

type TextLayout = {
	gap: number;
	wrap: boolean;
	textAxisAlignment: TextAxisAlignment;
};

export enum TextAxisAlignment {
	Start,
	Centre,
	End,
}

type TextStyle = {
	font: Partial<FontStyle>;
	weight: FontWeight;
	colour: string;
};

export enum FontWeight {
	Thin,
	Normal,
	Bold,
}

type FontStyle = {
	family: string;
	size: number;
};

type Box = {
	type: "box";
	layout?: Partial<Layout>;
	style?: Partial<BoxStyle>;
	children?: Renderable[];
};

type Layout = {
	size: Partial<Constraints>;
	direction: LayoutDirection;
	mainAxisAlignment: MainAxisAlignment;
	crossAxisAlignment: CrossAxisAlignment;
	gap: number;
	wrap: boolean;
	padding: number | Partial<Rect<number>>;
};

export enum LayoutDirection {
	Row,
	Column,
}

export enum MainAxisAlignment {
	Start,
	Centre,
	End,
}

export enum CrossAxisAlignment {
	Start,
	Centre,
	End,
}

type BoxStyle = {
	border: Partial<SideRect<BorderStyle>>;
	background: Partial<BackgroundStyle>;
};

type BorderStyle = {
	colour: string;
	thickness: number;
};

type BackgroundStyle = ColourBackground | ImageBackground | GradientBackground;

const isImageBackground = (
	background: Partial<BackgroundStyle>
): background is Partial<ImageBackground> =>
	!!(background as ImageBackground).image;

const isGradientBackground = (
	background: Partial<BackgroundStyle>
): background is Partial<GradientBackground> =>
	!!(background as GradientBackground).gradient;

type ColourBackground = string;

type ImageBackground = {
	image: HTMLImageElement;
	position: Point;
	fit: BackgroundFit;
};

export enum BackgroundFit {
	Cover,
	Contain,
}

type GradientBackground = {
	gradient: Gradient;
	position: Point;
	fit: BackgroundFit;
};

type Gradient = {
	angle: number;
	stops: GradientStop[];
};

type GradientStop = {
	color: string;
	at: number;
};

export type Renderable = Text | Box;

type Constraints = {
	minWidth?: number;
	width?: number;
	maxWidth?: number;
	minHeight?: number;
	height?: number;
	maxHeight?: number;
};

export const render = (
	context: CanvasRenderingContext2D,
	renderable: Renderable,
	position: Point,
	constraints?: Constraints
) => {
	switch (renderable.type) {
		case "text":
			renderText(context, renderable, position, constraints);
			break;
		case "box":
			renderBox(context, renderable, position, constraints);
			break;
		default:
			throw new Error(`Cannot render ${renderable}.`);
	}
};

const instantiateConstraints = (
	constraints: Constraints | undefined,
	grow?: boolean
): Size => {
	const width = Math.max(
		constraints?.minWidth ?? 0,
		Math.min(
			constraints?.maxWidth ?? Infinity,
			constraints?.width ?? (grow ? Infinity : 0)
		)
	);
	const height = Math.max(
		constraints?.minHeight ?? 0,
		Math.min(
			constraints?.maxHeight ?? Infinity,
			constraints?.height ?? (grow ? Infinity : 0)
		)
	);
	return { width, height };
};

const renderText = (
	context: CanvasRenderingContext2D,
	text: Text,
	position: Point,
	constraints?: Constraints
) => {
	const fontSize = text.style?.font?.size ?? 10;
	const fontFamily = text.style?.font?.family ?? "serif";
	const gap = text.layout?.gap ?? 0;
	const textColour = text.style?.colour ?? "black";
	const preferred = instantiateConstraints(constraints, true);

	context.font = `${fontSize}px ${fontFamily}`;
	const lines = wrapText(context, text.text, preferred.width);

	context.fillStyle = textColour;
	for (let i = 0; i < lines.length; i++) {
		context.fillText(
			lines[i]!,
			position.x,
			position.y + fontSize * (i + 1) + gap * Math.max(0, i)
		);
	}
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

const renderBox = (
	context: CanvasRenderingContext2D,
	box: Box,
	position: Point,
	constraints?: Constraints
) => {
	const layoutDirection = box.layout?.direction ?? LayoutDirection.Row;
	// TODO take mainAxisAlignment into account when there's more
	// space than required along the main axis
	const mainAxisAlignment =
		box.layout?.mainAxisAlignment ?? MainAxisAlignment.Start;
	const crossAxisAlignment =
		box.layout?.crossAxisAlignment ?? CrossAxisAlignment.Start;
	const preferred = measure(context, box, constraints);
	const padding = normalisePadding(box.layout?.padding);

	if (box.style?.background) {
		renderBackground(context, box.style.background, position, preferred);
	}

	// TODO: share code with measureBox
	const gap = box.layout?.gap ?? 0;
	let mainAxisOffset = 0;
	let crossAxisSize = 0;
	if (box.children) {
		for (let i = 0; i < box.children.length; i++) {
			const child = box.children[i]!;
			const size = measure(context, child, preferred);
			const x =
				position.x +
				(layoutDirection === LayoutDirection.Column
					? crossAxisAlignment === CrossAxisAlignment.Start
						? 0
						: crossAxisAlignment === CrossAxisAlignment.Centre
						? preferred.width / 2 - size.width / 2 - padding.horizontal / 2
						: preferred.width - size.width - padding.horizontal
					: 0);
			const y =
				position.y +
				(layoutDirection === LayoutDirection.Row
					? crossAxisAlignment === CrossAxisAlignment.Start
						? 0
						: crossAxisAlignment === CrossAxisAlignment.Centre
						? preferred.height / 2 - size.height / 2 - padding.vertical / 2
						: preferred.height - size.height - padding.vertical
					: 0);
			render(context, child, {
				x:
					padding.left +
					x +
					(layoutDirection === LayoutDirection.Row ? mainAxisOffset : 0),
				y:
					padding.top +
					y +
					(layoutDirection === LayoutDirection.Column ? mainAxisOffset : 0),
			});
			if (layoutDirection === LayoutDirection.Row) {
				mainAxisOffset += size.width;
				crossAxisSize = Math.max(crossAxisSize, size.height);
			} else {
				mainAxisOffset += size.height;
				crossAxisSize = Math.max(crossAxisSize, size.width);
			}
			if (i < box.children.length - 1) mainAxisOffset += gap;
		}
	}
};

const renderBackground = (
	context: CanvasRenderingContext2D,
	background: Partial<BackgroundStyle>,
	position: Point,
	size: Size
) => {
	if (typeof background === "string") {
		context.fillStyle = background;
		context.fillRect(position.x, position.y, size.width, size.height);
	} else if (isImageBackground(background)) {
		const fit = background.fit ?? BackgroundFit.Contain;
		switch (fit) {
			case BackgroundFit.Contain: {
				context.drawImage(
					background.image!,
					position.x,
					position.y,
					size.width,
					size.height
				);
				break;
			}
			default:
				throw new Error(`Unhandled background fit "${fit}".`);
		}
	} else if (isGradientBackground(background)) {
		// TODO: Figure out how to properly get w/h from angle using lendir
		const gradient = context.createLinearGradient(
			position.x,
			position.y,
			position.x + size.width,
			position.y + size.height
		);
		for (const stop of background.gradient!.stops) {
			gradient.addColorStop(stop.at, stop.color);
		}
		context.fillStyle = gradient;
		context.fillRect(position.x, position.y, size.width, size.height);
	} else {
		throw new Error(`Unhandled background type ${background}.`);
	}
};

export const measure = (
	context: CanvasRenderingContext2D,
	renderable: Renderable,
	constraints?: Constraints
): Size => {
	switch (renderable.type) {
		case "text":
			return measureText(context, renderable, constraints);
		case "box":
			return measureBox(context, renderable, constraints);
		default:
			throw new Error(`Cannot measure ${renderable}.`);
	}
};

const measureText = (
	context: CanvasRenderingContext2D,
	text: Text,
	constraints?: Constraints
): Size => {
	const fontSize = text.style?.font?.size ?? 10;
	const fontFamily = text.style?.font?.family ?? "serif";
	const gap = text.layout?.gap ?? 0;
	const preferred = instantiateConstraints(constraints, true);

	context.font = `${fontSize}px ${fontFamily}`;
	const measurement = context.measureText("");
	const lineHeight =
		measurement.fontBoundingBoxAscent +
		measurement.fontBoundingBoxDescent * 1.5;
	const lines = wrapText(
		context,
		text.text,
		text.layout?.wrap ? preferred.width : Infinity
	);
	let maxLineWidth = 0;
	for (const line of lines) {
		maxLineWidth = Math.max(maxLineWidth, context.measureText(line).width);
	}

	return {
		width: maxLineWidth,
		height: lines.length * lineHeight + gap * (lines.length - 1),
	};
};

const normalisePadding = (
	padding: Layout["padding"] | undefined
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

const measureBox = (
	context: CanvasRenderingContext2D,
	box: Box,
	constraints?: Constraints
): Size => {
	// TODO: share code with renderBox
	const padding = normalisePadding(box.layout?.padding);
	const layoutDirection = box.layout?.direction ?? LayoutDirection.Row;
	const gap = box.layout?.gap ?? 0;
	let mainAxisOffset = 0;
	let crossAxisSize = 0;
	if (box.children) {
		for (let i = 0; i < box.children.length; i++) {
			const child = box.children[i]!;
			const size = measure(context, child, constraints);
			if (layoutDirection === LayoutDirection.Row) {
				mainAxisOffset += size.width;
				crossAxisSize = Math.max(crossAxisSize, size.height);
			} else {
				mainAxisOffset += size.height;
				crossAxisSize = Math.max(crossAxisSize, size.width);
			}
			if (i < box.children.length - 1) mainAxisOffset += gap;
		}
	}

	const size =
		layoutDirection === LayoutDirection.Row
			? {
					width: mainAxisOffset,
					height: crossAxisSize,
			  }
			: {
					width: crossAxisSize,
					height: mainAxisOffset,
			  };
	return {
		width: size.width + padding.horizontal,
		height: size.height + padding.vertical,
	};
};
