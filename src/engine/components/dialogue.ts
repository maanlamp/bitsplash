import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { FontSettings } from "../font-settings";
import type { RichLine } from "../rich-text";

export class DialogueComponent {
	source: EntityId | null;
	font: FontSettings;
	charactersPerSecond = 24;

	pages: RichLine[][] = [];
	pageIndex = 0;
	revealed = 0;
	pause = 0 as Seconds;
	complete = false;

	choices: string[] = [];
	selectedOption = 0;

	opened = false;
	navUpHeld = false;
	navDownHeld = false;
	escHeld = false;

	constructor(
		source: EntityId | null = null,
		font: FontSettings = new FontSettings(),
	) {
		this.source = source;
		this.font = font;
	}
}
