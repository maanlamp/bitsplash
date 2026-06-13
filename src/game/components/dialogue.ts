import type { EntityId } from "../../engine/ecs";
import {
	type RichLine,
	richGlyphCount,
	richText,
} from "../../engine/rich-text";

export class DialogueComponent {
	lines: RichLine[];
	text: string;
	total: number;
	charactersPerSecond: number;
	frameTarget: EntityId | null;
	source: EntityId | null;
	revealed = 0;
	pause = 0;
	complete = false;
	opened = false;

	constructor(
		lines: RichLine[] = [],
		charactersPerSecond: number = 24,
		frameTarget: EntityId | null = null,
		source: EntityId | null = null,
	) {
		this.lines = lines;
		this.text = richText(lines);
		this.total = richGlyphCount(lines);
		this.charactersPerSecond = charactersPerSecond;
		this.frameTarget = frameTarget;
		this.source = source;
	}
}
