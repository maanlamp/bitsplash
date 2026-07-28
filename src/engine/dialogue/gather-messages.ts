import type { Story } from "inkjs/full";
import { tagValue } from "../ink/ink-tags";

/**
 * The `# speaker:` / `# emotion:` tag values in effect at a point in a story,
 * exactly as authored. They stay raw strings here: the vocabularies they draw
 * from are game content, and engine may not import game code.
 */
export type SpeakerTags = Readonly<{
	speaker: string | null;
	emotion: string | null;
}>;

/** Nothing attributed yet — the state a conversation starts from. */
export const NO_SPEAKER_TAGS: SpeakerTags = {
	speaker: null,
	emotion: null,
};

/**
 * One bubble's worth of story: the consecutive lines that share a speaker,
 * joined by their authored line breaks.
 */
export type MessageBlock = SpeakerTags & Readonly<{ text: string }>;

type GatheredMessages = Readonly<{
	blocks: readonly MessageBlock[];
	/**
	 * The tags in effect where the story stopped. Feed it back as the next
	 * call's `current` so an untagged line reached through a choice keeps its
	 * speaker.
	 */
	trailing: SpeakerTags;
}>;

type OpenBlock = { tags: SpeakerTags; lines: string[] };

/**
 * Drive `Continue()` to the next choice or the end of the story, splitting the
 * lines into speaker-delimited blocks.
 *
 * A block ends when a line carries a `speaker:` tag naming someone other than
 * the speaker in effect. A line with **no `speaker:` tag** inherits the current
 * one — which is not the same as a line with no tags at all: after
 * `ChooseChoiceIndex`, an unbracketed choice echoes its text with only its own
 * `id:` tag, and that echo belongs to the speaker who was talking.
 *
 * An `emotion:` tag updates the emotion carried alongside the speaker; each
 * block records the emotion in effect when its first line arrived.
 *
 * @example
 * story.ChoosePathString("checkpoint.demand");
 * const first = gatherMessages(story, NO_SPEAKER_TAGS);
 * story.ChooseChoiceIndex(0);
 * const echo = gatherMessages(story, first.trailing);
 */
export const gatherMessages = (
	story: Story,
	current: SpeakerTags,
): GatheredMessages => {
	const blocks: MessageBlock[] = [];
	let tags = current;
	let open: OpenBlock | null = null;

	const seal = (): void => {
		if (open) {
			blocks.push({ ...open.tags, text: open.lines.join("\n") });
			open = null;
		}
	};

	while (story.canContinue) {
		const line = story.Continue();
		const speaker = tagValue(story.currentTags, "speaker");
		const emotion = tagValue(story.currentTags, "emotion");
		if (speaker !== undefined && speaker !== tags.speaker) {
			seal();
			tags = { speaker, emotion: emotion ?? tags.emotion };
		} else if (emotion !== undefined) {
			tags = { speaker: tags.speaker, emotion };
		}
		const text = line?.trim() ?? "";
		if (text.length === 0) {
			continue;
		}
		open ??= { tags, lines: [] };
		open.lines.push(text);
	}
	seal();

	return { blocks, trailing: tags };
};
