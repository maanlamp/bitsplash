const caches = new WeakMap<Document, Map<string, string>>();

const cacheFor = (doc: Document): Map<string, string> => {
	let cache = caches.get(doc);
	if (!cache) {
		cache = new Map();
		caches.set(doc, cache);
	}
	return cache;
};

/**
 * Read a CSS custom property's resolved value, cached per document. Each
 * window has its own document (and may resolve theme variables differently),
 * so the cache is keyed by `doc` to avoid a satellite window reading the hub's
 * values.
 *
 * @param name The custom property name, e.g. `"--debug-axis-x"`.
 * @param doc The document to resolve against; defaults to the main document.
 */
export const cssVar = (
	name: string,
	doc: Document = document,
): string => {
	const cache = cacheFor(doc);
	const cached = cache.get(name);
	if (cached !== undefined) {
		return cached;
	}
	const value = getComputedStyle(doc.documentElement)
		.getPropertyValue(name)
		.trim();
	cache.set(name, value);
	return value;
};
