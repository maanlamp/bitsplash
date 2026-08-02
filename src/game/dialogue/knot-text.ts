import type { ECS } from "../../engine/ecs";
import type EventBus from "../../engine/events";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import type { Knot } from "../../engine/ink/knot";
import { ensureStory } from "./ink-bindings";

/**
 * Reads a knot's lines as one string without advancing the live story.
 *
 * The story state is snapshotted and restored around the read, so anything a
 * caller pulls out this way is invisible to the conversation the player is in.
 * Intended for one-shot overhead lines — barks — which have no choices and no
 * externals.
 *
 * @returns the joined text, or `null` when the world carries no ink story at all
 * (a headless world with no dialogue content is legitimate).
 * @throws if a story exists but the knot does not resolve — a dangling reference
 * is a programmer error, not a missing line.
 *
 * @example
 * const line = knotText(ecs, events, Reactions.line["npc-greet"]);
 */
export const knotText = (
	ecs: ECS,
	events: EventBus,
	knot: Knot,
): string | null => {
	const entry = ecs.queryFirst(InkStoryComponent);
	if (!entry) {
		return null;
	}
	const story = ensureStory(entry[1], events, ecs);
	const knotName = knot.split(".")[0];
	if (!knotName || !story.KnotContainerWithName(knotName)) {
		throw new Error(
			`knotText: ink path "${knot}" does not resolve to a knot in the loaded story.`,
		);
	}
	const snapshot = story.state.ToJson();
	try {
		story.ChoosePathString(knot);
		let text = "";
		while (story.canContinue) {
			const line = story.Continue();
			if (line && line.trim().length > 0) {
				text += (text.length > 0 ? " " : "") + line.trim();
			}
		}
		return text;
	} finally {
		story.state.LoadJson(snapshot);
	}
};
