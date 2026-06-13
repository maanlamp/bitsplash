import { file } from "../../engine/serialization/field-enums";
import { serializable } from "../../engine/serialization/serializable";
import yosterUrl from "../assets/yoster.ttf?url";

@serializable("DebugTag")
export class DebugTagComponent {
	@file(".ttf,.otf,.woff,.woff2,.font.zip")
	font: string;

	size: number;
	label: string;

	constructor(
		label: string = "entity",
		font: string = yosterUrl,
		size: number = 12,
	) {
		this.label = label;
		this.font = font;
		this.size = size;
	}
}
