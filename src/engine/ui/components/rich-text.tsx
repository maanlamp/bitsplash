import type { ColorInput } from "../../render/color-resolver";
import { Text } from "../reconciler/ui-elements";
import type { Style } from "../style/style";

export interface RichTextSegment {
	text: string;
	color?: ColorInput;
	bold?: boolean;
	italic?: boolean;
}

export interface RichTextProps {
	children?: string;
	segments?: readonly RichTextSegment[];
	style?: Style;
}

const clamp01 = (value: number): number =>
	Math.max(0, Math.min(1, value));

const channel = (value: number): string =>
	Math.round(clamp01(value) * 255)
		.toString(16)
		.padStart(2, "0");

const colorToTag = (color: ColorInput): string =>
	typeof color === "string"
		? color
		: `#${channel(color[0])}${channel(color[1])}${channel(color[2])}${channel(color[3])}`;

const escapeMarkup = (text: string): string =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

const segmentToMarkup = (segment: RichTextSegment): string => {
	let markup = escapeMarkup(segment.text);
	if (segment.italic) {
		markup = `<i>${markup}</i>`;
	}
	if (segment.bold) {
		markup = `<b>${markup}</b>`;
	}
	if (segment.color !== undefined) {
		markup = `<color=${colorToTag(segment.color)}>${markup}</color>`;
	}
	return markup;
};

export const richTextMarkup = (
	segments: readonly RichTextSegment[],
): string => segments.map(segmentToMarkup).join("");

export const RichText = ({
	children,
	segments,
	style,
}: RichTextProps) => {
	const content = segments
		? richTextMarkup(segments)
		: (children ?? "");
	return <Text style={style}>{content}</Text>;
};
