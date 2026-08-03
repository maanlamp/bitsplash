import { Timeline } from "../animation/timeline";
import { Tween } from "../animation/tween";
import type { EntityId } from "../ecs";
import { EntityRef } from "../entity-ref";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import { FontSettings } from "../text/font-settings";
import type { WrappedText } from "./dialogue-text";

export type DialoguePhase = "entering" | "open" | "closing";

@serializable("Dialogue")
export class DialogueComponent {
	@serialize() source: EntityRef;
	/**
	 * The typeface {@link text} is wrapped in — the speaker's own, written by the
	 * `present` binding each time it puts a message up, so the typewriter counts
	 * the glyphs the presentation layer paints.
	 */
	@serialize() font: FontSettings;
	/**
	 * The raw `# speaker:` tag in effect where the story last stopped, empty when
	 * nothing has been attributed yet. It stays a raw string because the
	 * vocabulary it draws from is game content; the game layer feeds it back into
	 * `gatherMessages` so a line reached through a choice keeps its speaker.
	 */
	@serialize() speaker = "";
	/** The raw `# emotion:` tag in effect, carried alongside {@link speaker}. */
	@serialize() emotion = "";

	/**
	 * The message on screen as **rich-text markup**, ready to wrap — the same
	 * string the presentation layer wraps to paint it, tags and all.
	 */
	@serialize() text = "";
	@serialize() revealed = 0;
	/**
	 * {@link text} laid out for display, rebuilt by `DialogueSystem` whenever
	 * `text` changes. Transient: it is derived from `text` and the loaded font,
	 * so a restored save re-wraps against whatever font is loaded then.
	 */
	wrapped: WrappedText | null = null;
	cps = 0;
	/**
	 * Typewriter hold after a punctuation glyph. Transient like {@link wrapped}:
	 * it is re-derived from the wrapped text as the reveal advances.
	 */
	pause = new Timeline();
	complete = false;

	@serialize() choices: string[] = [];
	@serialize() choiceTags: string[][] = [];
	@serialize() selectedOption = 0;

	@serialize() opened = false;
	pendingConfirm = false;

	@serialize() phase: DialoguePhase = "entering";
	@serialize() slide = new Tween();

	constructor(
		source: EntityId | null = null,
		font: FontSettings = new FontSettings(),
	) {
		this.source = new EntityRef(source);
		this.font = font;
	}
}
