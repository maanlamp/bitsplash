/**
 * Read the value of a `key: value` ink tag, ignoring surrounding whitespace.
 *
 * Tag values are raw authored strings; narrowing them to a validated id is the
 * caller's job, and belongs to whichever layer owns the vocabulary.
 *
 * @example
 * tagValue(story.currentTags, "speaker"); // "bramble" | undefined
 */
export const tagValue = (
	tags: readonly string[] | null,
	key: string,
): string | undefined => {
	for (const tag of tags ?? []) {
		const i = tag.indexOf(":");
		if (i >= 0 && tag.slice(0, i).trim() === key) {
			return tag.slice(i + 1).trim();
		}
	}
	return undefined;
};

/**
 * Whether a valueless ink tag — `# narrate`, not `# key: value` — is present.
 *
 * A tag carrying a colon is never a flag, so `# narrate: yes` does not match
 * `narrate`. Which flags exist is game content, and validated where that
 * vocabulary lives.
 *
 * @example
 * hasFlagTag(story.currentChoices[0]?.tags ?? null, "narrate"); // true | false
 */
export const hasFlagTag = (
	tags: readonly string[] | null,
	flag: string,
): boolean => (tags ?? []).some((tag) => tag.trim() === flag);
