import {
	bark,
	castRole,
	chronicleEquals,
	despawn,
	moveTo,
	sequenceDef,
	seq,
	setFlag,
	spawn,
	waitUntil,
} from "../../engine/sequence/builder";
import type { SequenceDef } from "../../engine/sequence/sequence-def";

export const lostCritterFoundSequence: SequenceDef = sequenceDef({
	id: "lost-critter-found",
	class: "ambient",
	cast: {
		player: castRole("player"),
	},
	root: seq(
		"critter.found.root",
		spawn("critter.found.spawn", {
			prefab: "critter",
			at: { x: 128, y: 80 },
			bind: "critter",
			tag: "lost-critter",
		}),
		bark("critter.found.mew", {
			actor: "critter",
			knot: "critter.mew",
			seconds: 2.5,
		}),
		setFlag("critter.found.flag", {
			flag: "critter.state",
			value: "found",
		}),
	),
});

export const lostCritterHomeSequence: SequenceDef = sequenceDef({
	id: "lost-critter-home",
	class: "ambient",
	cast: {
		player: castRole("player"),
		critter: castRole("byTag", { tag: "lost-critter" }),
	},
	root: seq(
		"critter.home.root",
		waitUntil(
			"critter.home.gate",
			chronicleEquals({ flag: "critter.state", value: "found" }),
		),
		bark("critter.home.call", {
			actor: "critter",
			knot: "critter.call",
			seconds: 2,
		}),
		moveTo("critter.home.lead", {
			actor: "critter",
			to: "player",
			arriveTolerance: 12,
		}),
		setFlag("critter.home.flag", {
			flag: "critter.state",
			value: "home",
		}),
		despawn("critter.home.despawn", { actor: "critter" }),
	),
});
