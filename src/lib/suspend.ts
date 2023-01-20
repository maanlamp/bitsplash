type Suspension = {
	promise: Promise<any>;
	error?: Error;
	value?: any;
};

const cache: Record<string, Suspension> = {};

/** Most networking that happens in an app is simple fetch-then-display logic. This function uses the suspense API to _suspend_ a component while loading data.
 *
 * This is not a hook, so you can use it _anywhere_. Ordering is not important, so it can be invoked conditionally.
 *
 * This function uses memoisation, meaning it requires some way to save calculated values. Often it can figure it out from the `promise` itself, but it might need a little help. If `suspend` seems to yield wrong results when switching between instances of the same view, you might need to specify a `key` that is unique to that view.
 */
const suspend = <T>(promise: () => Promise<T>, key?: keyof any): T => {
	const cacheKey = promise.toString() + key?.toString();
	const found = cache[cacheKey];

	if (found) {
		if ("error" in found) throw found.error;
		// TODO: Refetch in background if stale
		if ("value" in found) return found.value;
		throw found.promise;
	}

	cache[cacheKey] = {
		promise: promise().then(
			value => (cache[cacheKey].value = value),
			error => (cache[cacheKey].error = error)
		),
	};

	throw cache[cacheKey].promise;
};

export default suspend;
