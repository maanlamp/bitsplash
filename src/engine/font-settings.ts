import { file, options, required } from "./serialization/field-enums";
import { valueType } from "./serialization/value-type";

export const fontStyleLabels = [
	"Regular",
	"Bold",
	"Italic",
	"Bold Italic",
] as const;

export type FontStyleLabel = (typeof fontStyleLabels)[number];

@valueType()
export class FontSettings {
	@required()
	@file(".ttf,.otf,.woff,.woff2,.font.zip")
	font: string;
	family: string;
	size: number;
	@options(fontStyleLabels)
	variant: FontStyleLabel;

	constructor(
		font: string = "",
		size: number = 16,
		variant: FontStyleLabel = "Regular",
		family: string = "",
	) {
		this.font = font;
		this.size = size;
		this.variant = variant;
		this.family = family;
	}
}
