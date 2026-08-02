import type { EntityId } from "../ecs";

/**
 * Frame-to-frame set differences over entity ids, without allocating.
 *
 * Awareness systems all keep "who was in this set last frame" and need the edges
 * — who joined, who left — every frame for every actor. Written the obvious way
 * that is three arrays and two closures per actor per frame, which at a few
 * hundred hertz is most of what the frame loop allocates. Every buffer here is
 * the caller's, and the caller reuses it.
 *
 * Membership is a linear scan rather than a `Set`, because these sets hold a
 * handful of ids at most and building a `Set` to query it would allocate the
 * thing being avoided.
 */

/**
 * Write into `entered` the ids in `next` that `previous` does not hold, and
 * into `exited` the ids `previous` holds that `next` does not. Both outputs are
 * cleared first.
 *
 * @example
 * diffIds(perception.noticed, noticedThisFrame, entered, exited);
 */
export const diffIds = (
	previous: ReadonlyArray<EntityId>,
	next: ReadonlyArray<EntityId>,
	entered: EntityId[],
	exited: EntityId[],
): void => {
	entered.length = 0;
	exited.length = 0;
	for (let i = 0; i < next.length; i++) {
		const id = next[i]!;
		if (!previous.includes(id)) {
			entered.push(id);
		}
	}
	for (let i = 0; i < previous.length; i++) {
		const id = previous[i]!;
		if (!next.includes(id)) {
			exited.push(id);
		}
	}
};

/** Replace `target`'s contents with `source`'s, keeping `target`'s identity. */
export const copyIds = (
	target: EntityId[],
	source: ReadonlyArray<EntityId>,
): void => {
	target.length = source.length;
	for (let i = 0; i < source.length; i++) {
		target[i] = source[i]!;
	}
};
