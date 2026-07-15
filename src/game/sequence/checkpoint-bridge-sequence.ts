import {
	blackboardEquals,
	branch,
	castRole,
	dialogue,
	focusOn,
	sequenceDef,
	seq,
	setFlag,
} from "../../engine/sequence/builder";
import type { SequenceDef } from "../../engine/sequence/sequence-def";

export const checkpointBridgeSequence: SequenceDef = sequenceDef({
	id: "checkpoint-bridge",
	class: "exclusive",
	cast: {
		player: castRole("player"),
		guard: castRole("npcByKnot", { knot: "checkpoint.guard" }),
	},
	root: seq(
		"checkpoint.root",
		focusOn("checkpoint.frame-guard", {
			target: "guard",
			framing: { zoom: 4, mode: "glide", duration: 1 },
		}),
		dialogue("checkpoint.demand", {
			knot: "checkpoint.demand",
			source: "guard",
			capture: "answer",
		}),
		branch(
			"checkpoint.decide",
			blackboardEquals({ key: "answer", value: "bribe" }),
			seq(
				"checkpoint.bribed",
				setFlag("checkpoint.flag-bribed", {
					flag: "faction.guards",
					value: "bought",
				}),
				dialogue("checkpoint.bribe-accept", {
					knot: "checkpoint.bribe_accept",
					source: "guard",
				}),
			),
			seq(
				"checkpoint.refused",
				setFlag("checkpoint.flag-refused", {
					flag: "faction.guards",
					value: "wary",
				}),
				dialogue("checkpoint.refuse", {
					knot: "checkpoint.refuse",
					source: "guard",
				}),
			),
		),
		dialogue("checkpoint.wave-through", {
			knot: "checkpoint.wave_through",
			source: "guard",
		}),
	),
});
