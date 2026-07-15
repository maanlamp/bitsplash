import { Tween } from "../animation/tween";
import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { EntityRef } from "../entity-ref";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { FontSettings } from "../text/font-settings";
import type { RichLine } from "../text/rich-text";

export type DialoguePhase = "entering" | "open" | "closing";

@serializable("Dialogue")
export class DialogueComponent {
	@serialize() source: EntityRef;
	@serialize() font: FontSettings;
	@serialize() speaker = "";

	@serialize() text = "";
	@serialize() paginated = false;
	@serialize() pages: RichLine[][] = [];
	pausesByPage: number[][] = [];
	speedsByPage: number[][] = [];
	@serialize() pageIndex = 0;
	@serialize() revealed = 0;
	cps = 0;
	pause = 0 as Seconds;
	complete = false;

	@serialize() choices: string[] = [];
	@serialize() choiceTags: string[][] = [];
	@serialize() selectedOption = 0;

	@serialize() opened = false;
	navUpHeld = false;
	navDownHeld = false;
	pendingConfirm = false;

	@serialize() phase: DialoguePhase = "entering";
	slide = new Tween();

	constructor(
		source: EntityId | null = null,
		font: FontSettings = new FontSettings(),
	) {
		this.source = new EntityRef(source);
		this.font = font;
	}
}
