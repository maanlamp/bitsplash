import {
	castRole,
	dialogue,
	follow,
	sequenceDef,
	seq,
} from "../../engine/sequence/builder";
import type { SequenceDef } from "../../engine/sequence/sequence-def";

export const NPC_CHAT_DEF_ID = "npc-chat";

export const npcChatSequence: SequenceDef = sequenceDef({
	id: NPC_CHAT_DEF_ID,
	class: "exclusive",
	cast: {
		player: castRole("player"),
		npc: castRole("blackboardEntity", { key: "npc" }),
	},
	root: seq(
		"npc-chat.root",
		follow("npc-chat.frame", { actors: ["player", "npc"] }),
		dialogue("npc-chat.line", {
			knotKey: "knot",
			source: "npc",
		}),
		follow("npc-chat.restore", { actors: ["player"] }),
	),
});
