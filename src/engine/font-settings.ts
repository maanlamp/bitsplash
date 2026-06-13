import {
	fontStyleLabels,
	type FontStyleLabel,
} from "../editor/font/font-preview";
import yosterIslandUrl from "../game/assets/yoster-island.font.zip?url";
import { file, options } from "./serialization/field-enums";
import { valueType } from "./serialization/value-type";

@valueType()
export class FontSettings {
	@file(".ttf,.otf,.woff,.woff2,.font.zip")
	font: string;
	family: string;
	size: number;
	@options(fontStyleLabels)
	variant: FontStyleLabel;

	constructor(
		font: string = yosterIslandUrl,
		size: number = 12,
		variant: FontStyleLabel = "Regular",
		family: string = "",
	) {
		this.font = font;
		this.size = size;
		this.variant = variant;
		this.family = family;
	}
}
