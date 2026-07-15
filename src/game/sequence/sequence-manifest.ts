import { registerEngineSequenceOps } from "../../engine/sequence/engine-ops";
import type { SequenceDef } from "../../engine/sequence/sequence-def";
import { registerSequenceDef } from "../../engine/sequence/sequence-system";
import { ambushDrillSequence } from "./ambush-drill-sequence";
import { campfireStargazerSequence } from "./campfire-stargazer-sequence";
import { checkpointBridgeSequence } from "./checkpoint-bridge-sequence";
import { registerGameSequenceOps } from "./game-ops";
import {
	lostCritterFoundSequence,
	lostCritterHomeSequence,
} from "./lost-critter-sequence";
import { npcChatSequence } from "./npc-chat-sequence";
import {
	pickupTourKissSequence,
	pickupTourSequence,
	registerPickupTourOps,
} from "./pickup-tour-sequence";

export const SEQUENCE_DEFS: ReadonlyArray<SequenceDef> = [
	checkpointBridgeSequence,
	ambushDrillSequence,
	campfireStargazerSequence,
	lostCritterFoundSequence,
	lostCritterHomeSequence,
	npcChatSequence,
	pickupTourSequence,
	pickupTourKissSequence,
];

let registered = false;

export const registerSequenceContent = (): void => {
	if (registered) {
		return;
	}
	registered = true;
	registerEngineSequenceOps();
	registerGameSequenceOps();
	registerPickupTourOps();
	for (const def of SEQUENCE_DEFS) {
		registerSequenceDef(def);
	}
};

registerSequenceContent();
