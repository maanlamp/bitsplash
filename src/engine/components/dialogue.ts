import { Tween } from "../animation/tween";
import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { FontSettings } from "../font-settings";
import type { RichLine } from "../rich-text";

export type DialoguePhase = "entering" | "open" | "closing";

export class DialogueComponent {
	source: EntityId | null;
	font: FontSettings;
	panel: string;
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

	phase: DialoguePhase = "entering";
	slide = new Tween();

	constructor(
		source: EntityId | null = null,
		font: FontSettings = new FontSettings(),
		panel = "",
	) {
		this.source = source;
		this.font = font;
		this.panel = panel;
	}
}
