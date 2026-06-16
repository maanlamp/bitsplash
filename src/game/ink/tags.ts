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
