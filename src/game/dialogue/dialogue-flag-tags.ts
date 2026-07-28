/**
 * Log the chosen option in the conversation transcript as something the player
 * said or did.
 *
 * Only meaningful on a **bracketed** option (`+ # narrate [Accept]`), whose echo
 * ink suppresses. An unbracketed option is echoed as a real story line, and that
 * echo is already its own record.
 *
 * Recording is opt-in because pure navigation — `[Leave]`, `[Decline]` — is not
 * something the player said, and a transcript full of it is clutter. A forgotten
 * tag costs one missing log line; a forgotten opt-out would put "Leave" in the
 * log.
 *
 * Tags on a bracketed option go *before* the bracket: ink treats anything after
 * `]` as output content, not as a tag on the choice.
 *
 * @example
 * hasFlagTag(story.currentChoices[0]?.tags ?? null, NARRATE_TAG);
 */
export const NARRATE_TAG = "narrate";

/**
 * The valueless ink tags dialogue content may carry — a bare `# narrate` rather
 * than a `# key: value` pair. Nothing to do with chronicle flags; "flag" here
 * means the tag is its own whole meaning.
 *
 * Because a flag tag has no value, a typo cannot be caught by validating what
 * follows a colon: `# narate` would simply never match, and the behaviour it
 * asked for would silently never happen. So the vocabulary is closed —
 * `scripts/gen-ink.ts` rejects any bare tag outside this tuple, and `bun run gen`
 * runs ahead of `check`, `build` and `test`.
 */
export const DIALOGUE_FLAG_TAGS = [NARRATE_TAG] as const;

export type DialogueFlagTag = (typeof DIALOGUE_FLAG_TAGS)[number];

const DIALOGUE_FLAG_TAG_SET: ReadonlySet<string> = new Set(
	DIALOGUE_FLAG_TAGS,
);

/** Narrows an authored bare ink tag to a {@link DialogueFlagTag}. */
export const isDialogueFlagTag = (
	value: string,
): value is DialogueFlagTag => DIALOGUE_FLAG_TAG_SET.has(value);
