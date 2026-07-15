import {
	castRole,
	dialogue,
	focusOn,
	sequenceDef,
	seq,
	wait,
} from "../../engine/sequence/builder";
import type { SequenceDef } from "../../engine/sequence/sequence-def";

export const campfireStargazerSequence: SequenceDef = sequenceDef({
	id: "campfire-stargazer",
	class: "exclusive",
	cast: {
		player: castRole("player"),
		hero: castRole("player"),
		companion: castRole("npcByKnot", { knot: "campfire.companion" }),
	},
	root: seq(
		"campfire.root",
		focusOn("campfire.settle", {
			target: "companion",
			framing: { zoom: 4, mode: "glide", duration: 1.5 },
		}),
		dialogue("campfire.open", {
			knot: "campfire.open",
			source: "companion",
		}),
		wait("campfire.beat-1", 0.6),
		dialogue("campfire.reply", {
			knot: "campfire.reply",
			source: "hero",
		}),
		focusOn("campfire.look-up", {
			target: { x: 0, y: -240 },
			framing: { zoom: 2, mode: "glide", duration: 2.5 },
		}),
		dialogue("campfire.stars", {
			knot: "campfire.stars",
			source: "companion",
		}),
		wait("campfire.beat-2", 0.8),
		dialogue("campfire.wish", {
			knot: "campfire.wish",
			source: "hero",
		}),
		dialogue("campfire.memory", {
			knot: "campfire.memory",
			source: "companion",
		}),
		wait("campfire.beat-3", 0.5),
		dialogue("campfire.quiet", {
			knot: "campfire.quiet",
			source: "hero",
		}),
		focusOn("campfire.close", {
			target: "companion",
			framing: {
				zoom: 4,
				mode: "glide",
				duration: 1.5,
				follow: true,
			},
		}),
		dialogue("campfire.goodnight", {
			knot: "campfire.goodnight",
			source: "companion",
		}),
	),
});
