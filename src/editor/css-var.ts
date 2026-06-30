const cache = new Map<string, string>();

export const cssVar = (name: string): string => {
	const cached = cache.get(name);
	if (cached !== undefined) {
		return cached;
	}
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	cache.set(name, value);
	return value;
};
