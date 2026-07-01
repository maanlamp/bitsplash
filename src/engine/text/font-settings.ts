import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";

export const fontStyleLabels = [
	"Regular",
	"Bold",
	"Italic",
	"Bold Italic",
] as const;

export type FontStyleLabel = (typeof fontStyleLabels)[number];

@serializable("FontSettings")
export class FontSettings implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize({
		required: true,
		file: ".ttf,.otf,.woff,.woff2,.font.zip",
	})
	font: string;
	@serialize() family: string;
	@serialize() size: number;
	@serialize({ options: fontStyleLabels }) variant: FontStyleLabel;

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
