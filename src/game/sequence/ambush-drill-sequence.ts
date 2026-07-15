import {
	bark,
	cameraTo,
	castRole,
	dialogue,
	enemiesDead,
	lockControl,
	parallel,
	releaseControl,
	sequenceDef,
	seq,
	spawn,
	waitUntil,
} from "../../engine/sequence/builder";
import type { SequenceDef } from "../../engine/sequence/sequence-def";

export const ambushDrillSequence: SequenceDef = sequenceDef({
	id: "ambush-drill",
	class: "exclusive",
	cast: {
		player: castRole("player"),
	},
	root: seq(
		"ambush.root",
		cameraTo("ambush.frame-arena", {
			target: { x: 320, y: 96 },
			zoom: 3,
			mode: "glide",
			duration: 1.2,
		}),
		parallel(
			"ambush.spawn-wave",
			spawn("ambush.spawn-a", {
				prefab: "enemy",
				at: { x: 288, y: 96 },
				bind: "raider-a",
				tag: "ambush",
			}),
			spawn("ambush.spawn-b", {
				prefab: "enemy",
				at: { x: 352, y: 96 },
				bind: "raider-b",
				tag: "ambush",
			}),
		),
		parallel(
			"ambush.taunts",
			bark("ambush.taunt-a", {
				actor: "raider-a",
				knot: "ambush.taunt_a",
				seconds: 2,
			}),
			bark("ambush.taunt-b", {
				actor: "raider-b",
				knot: "ambush.taunt_b",
				seconds: 2,
			}),
		),
		releaseControl("ambush.release"),
		waitUntil("ambush.clear", enemiesDead({ tag: "ambush" })),
		lockControl("ambush.regrab"),
		cameraTo("ambush.frame-player", {
			target: "player",
			zoom: 3,
			mode: "glide",
			duration: 1,
			follow: true,
		}),
		dialogue("ambush.debrief", {
			knot: "ambush.debrief",
			source: "player",
		}),
	),
});
