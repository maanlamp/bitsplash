/**
 * Clamp `index + delta` to `[0, length - 1]`. Returns `index` unchanged when the
 * collection is empty. Used by the timeline's arrow-key cel navigation to step
 * the active frame or layer without wrapping past either end.
 *
 * @example
 * clampedIndex(0, -1, 5); // 0  (already at the start)
 * clampedIndex(4, +1, 5); // 4  (already at the end)
 * clampedIndex(2, +1, 5); // 3
 */
export const clampedIndex = (
	index: number,
	delta: number,
	length: number,
): number => {
	if (length <= 0) {
		return index;
	}
	return Math.max(0, Math.min(length - 1, index + delta));
};

/**
 * The layer id `delta` rows away from `currentId` in **display order** — the
 * order the timeline paints its rows, top-first — clamped at both ends.
 * `displayIds[0]` is the topmost row, so `delta = -1` moves to the layer shown
 * above and `delta = +1` to the one below. Returns `currentId` when it is not in
 * the list or the list is empty.
 *
 * @example
 * // display = ["top", "mid", "bottom"]
 * adjacentLayerId(display, "mid", -1); // "top"
 * adjacentLayerId(display, "top", -1); // "top"  (clamped at the top row)
 */
export const adjacentLayerId = (
	displayIds: readonly string[],
	currentId: string,
	delta: number,
): string => {
	const at = displayIds.indexOf(currentId);
	if (at < 0) {
		return currentId;
	}
	return (
		displayIds[clampedIndex(at, delta, displayIds.length)] ??
		currentId
	);
};
