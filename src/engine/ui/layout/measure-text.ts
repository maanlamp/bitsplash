import { MeasureMode } from "yoga-layout";
import type { LoadedFont } from "../../load";
import type { FontSettings } from "../../text/font-settings";
import {
	parseRichText,
	type RichLine,
	wrapRichText,
} from "../../text/rich-text";
import { measureText, wrapText } from "../../text/text-layout";
import type { UiNode } from "../reconciler/ui-node";
import type { Style } from "../style/style";

export type FontResolver = (font?: FontSettings) => LoadedFont | null;

const nodeFont = (node: UiNode): FontSettings | undefined =>
	(node.props.style as Style | undefined)?.font;

export type TextMetrics = Readonly<{ width: number; height: number }>;

export type YogaSize = Readonly<{ width: number; height: number }>;

export type MeasureFn = (
	width: number,
	widthMode: MeasureMode,
	height: number,
	heightMode: MeasureMode,
) => YogaSize;

export type MeasureProvider = (node: UiNode) => MeasureFn | undefined;

const textContent = (children: unknown): string => {
	if (typeof children === "string") {
		return children;
	}
	if (typeof children === "number") {
		return String(children);
	}
	return "";
};

export const wrapStyledText = (
	font: LoadedFont,
	text: string,
	maxWidth: number,
): RichLine[] => wrapRichText(font, parseRichText(text), maxWidth);

const lineWidth = (font: LoadedFont, line: RichLine): number => {
	const { glyphs } = line;
	if (glyphs.length === 0) {
		return 0;
	}
	const last = glyphs[glyphs.length - 1]!;
	return last.x + measureText(font, last.char);
};

export const blockWidth = (
	font: LoadedFont,
	lines: RichLine[],
): number => {
	let widest = 0;
	for (const line of lines) {
		widest = Math.max(widest, lineWidth(font, line));
	}
	return widest;
};

export const resolveMeasuredWidth = (
	natural: number,
	available: number,
	widthMode: MeasureMode,
): number => {
	if (widthMode === MeasureMode.Exactly) {
		return available;
	}
	if (widthMode === MeasureMode.AtMost) {
		return Math.min(natural, available);
	}
	return natural;
};

export const measureStyledText = (
	font: LoadedFont,
	text: string,
	maxWidth: number,
): TextMetrics => {
	const lines = wrapStyledText(font, text, maxWidth);
	return {
		width: blockWidth(font, lines),
		height: lines.length * font.lineHeight,
	};
};

export const measurePlainText = (
	font: LoadedFont,
	text: string,
	maxWidth: number,
): TextMetrics => {
	const lines = wrapText(font, text, maxWidth);
	let width = 0;
	for (const line of lines) {
		width = Math.max(width, measureText(font, line));
	}
	return { width, height: lines.length * font.lineHeight };
};

const glyphsOf = (node: UiNode): readonly RichLine[] | undefined =>
	node.props.glyphs as readonly RichLine[] | undefined;

export const createTextMeasureProvider = (
	resolveFont: FontResolver,
): MeasureProvider => {
	return (node) => {
		if (node.type === "glyphs") {
			return () => {
				const font = resolveFont(nodeFont(node));
				const lines = glyphsOf(node);
				if (!font || !lines) {
					return { width: 0, height: 0 };
				}
				return {
					width: Math.ceil(blockWidth(font, lines as RichLine[])),
					height: Math.ceil(lines.length * font.lineHeight),
				};
			};
		}
		if (node.type !== "text") {
			return undefined;
		}
		return (width, widthMode) => {
			const font = resolveFont(nodeFont(node));
			if (!font) {
				return { width: 0, height: 0 };
			}
			const content = textContent(node.props.children);
			const maxWidth =
				widthMode === MeasureMode.Undefined
					? Number.POSITIVE_INFINITY
					: width;
			const lines = wrapStyledText(font, content, maxWidth);
			const natural = blockWidth(font, lines);
			return {
				width: Math.ceil(
					resolveMeasuredWidth(natural, width, widthMode),
				),
				height: Math.ceil(lines.length * font.lineHeight),
			};
		};
	};
};
