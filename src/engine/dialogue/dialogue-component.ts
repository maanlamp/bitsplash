import { Tween } from "../animation/tween";
import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { FontSettings } from "../text/font-settings";
import type { RichLine } from "../text/rich-text";

export type DialoguePhase = "entering" | "open" | "closing";

export class DialogueComponent {
	source: EntityId | null;
	font: FontSettings;

	text = "";
	paginated = false;
	pages: RichLine[][] = [];
	pageIndex = 0;
	revealed = 0;
	pause = 0 as Seconds;
	complete = false;

	choices: string[] = [];
	selectedOption = 0;

	opened = false;
	hold = false;
	navUpHeld = false;
	navDownHeld = false;
	escHeld = false;

	phase: DialoguePhase = "entering";
	slide = new Tween();

	constructor(
		source: EntityId | null = null,
		font: FontSettings = new FontSettings(),
	) {
		this.source = source;
		this.font = font;
	}
}
