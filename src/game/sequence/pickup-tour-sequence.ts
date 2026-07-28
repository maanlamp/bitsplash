import type { ECS, EntityId } from "../../engine/ecs";
import {
	castRole,
	dialogue,
	escort,
	focusOn,
	moveTo,
	parallel,
	type SequenceFraming,
	sequenceDef,
	seq,
	wait,
} from "../../engine/sequence/builder";
import type { LeafOpNode, OpNode } from "../../engine/sequence/op";
import type {
	OpExecutor,
	OpContext,
} from "../../engine/sequence/op-registry";
import { registerOpType } from "../../engine/sequence/op-registry";
import type { SequenceDef } from "../../engine/sequence/sequence-def";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { PickupTutor } from "../content/dialogue/knots.gen";
import {
	PICKUP_TYPES,
	PickupComponent,
	type PickupType,
} from "../pickup/pickup-component";
import { QuestComponent } from "../quest/quest-component";
import { QuestMarkerTagComponent } from "../quest/quest-marker-tag-component";

export const PICKUP_TOUR_QUEST = "pickup_tour";
export const PICKUP_TOUR_TAG = "quest:pickup_tour";

const INTRO: SequenceFraming = { zoom: 5, follow: true };
const EDGE: SequenceFraming = {
	zoom: 2,
	mode: "glide",
	duration: 1.5,
	follow: true,
};
const FOCUS: SequenceFraming = { zoom: 6 };
const SHAFT: SequenceFraming = {
	zoom: 1.5,
	mode: "glide",
	duration: 2,
	offsetTiles: { x: 0, y: -12 },
};
const ROAD: SequenceFraming = {
	zoom: 6,
	mode: "glide",
	duration: 2.5,
	offsetTiles: { x: -10, y: 0 },
};
const WRAP: SequenceFraming = { zoom: 4 };
const FOLLOW: SequenceFraming = { zoom: 3, follow: true };

export const SETUP_PICKUP_TOUR_QUEST = "setupPickupTourQuest";

const pickupOf = (ecs: ECS, type: PickupType): EntityId | undefined =>
	ecs.find(PickupComponent, (pickup) => pickup.type === type)?.[0];

const setupQuest = (ecs: ECS): void => {
	let count = 0;
	for (const type of PICKUP_TYPES) {
		const found = pickupOf(ecs, type);
		if (found === undefined) {
			continue;
		}
		count += 1;
		ecs.addComponent(
			found,
			new QuestMarkerTagComponent(
				PICKUP_TOUR_QUEST,
				undefined,
				"collect",
			),
		);
	}
	for (const [, quest] of ecs.query(QuestComponent)) {
		if (quest.id === PICKUP_TOUR_QUEST) {
			quest.counters[PICKUP_TOUR_TAG] = 0;
			quest.goals[PICKUP_TOUR_TAG] = count;
		}
	}
};

const setupPickupTourQuestExecutor: OpExecutor = {
	arm(ctx: OpContext) {
		setupQuest(ctx.ecs);
	},
	poll() {
		return true;
	},
	skip(ctx: OpContext) {
		setupQuest(ctx.ecs);
		return true;
	},
	skippable() {
		return true;
	},
};

const setupQuestNode = (stepId: string): LeafOpNode => ({
	kind: "op",
	type: SETUP_PICKUP_TOUR_QUEST,
	stepId,
	params: {},
});

const stop = (type: PickupType, pan?: SequenceFraming): OpNode =>
	seq(
		`pt.stop-${type}`,
		focusOn(`pt.stop-${type}.focus`, {
			target: type,
			framing: FOCUS,
		}),
		pan
			? parallel(
					`pt.stop-${type}.say`,
					dialogue(`pt.stop-${type}.line`, {
						knot: PickupTutor.line[type],
						source: "quartermaster",
					}),
					focusOn(`pt.stop-${type}.pan`, {
						target: type,
						framing: pan,
					}),
				)
			: dialogue(`pt.stop-${type}.line`, {
					knot: PickupTutor.line[type],
					source: "quartermaster",
				}),
	);

export const pickupTourSequence: SequenceDef = sequenceDef({
	id: "pickup-tour",
	class: "exclusive",
	cast: {
		player: castRole("player"),
		quartermaster: castRole("npcByKnot", { knot: PickupTutor.root }),
		"wall-slide": castRole("pickupByType", { type: "wall-slide" }),
		"wall-jump": castRole("pickupByType", { type: "wall-jump" }),
		dash: castRole("pickupByType", { type: "dash" }),
		"extra-jump": castRole("pickupByType", { type: "extra-jump" }),
	},
	root: seq(
		"pt.root",
		setupQuestNode("pt.setup"),
		focusOn("pt.intro-cam", {
			target: "quartermaster",
			framing: INTRO,
		}),
		parallel(
			"pt.intro-walk",
			escort("pt.escort", {
				follower: "player",
				leader: "quartermaster",
				to: { relTo: "quartermaster", dx: 5.5 * TILE_SIZE },
			}),
			dialogue("pt.intro-walk-line", {
				knot: PickupTutor.pt_intro_walk,
				source: "quartermaster",
			}),
		),
		focusOn("pt.edge-cam", {
			target: "quartermaster",
			framing: EDGE,
		}),
		dialogue("pt.intro-line", {
			knot: PickupTutor.pt_intro,
			source: "quartermaster",
		}),
		stop("wall-slide"),
		stop("wall-jump", SHAFT),
		stop("dash", ROAD),
		stop("extra-jump"),
		focusOn("pt.wrap-cam", {
			target: "quartermaster",
			framing: WRAP,
		}),
		dialogue("pt.wrap-line", {
			knot: PickupTutor.pt_wrap,
			source: "quartermaster",
		}),
		focusOn("pt.wrap-release", { target: "player", framing: FOLLOW }),
	),
});

export const pickupTourKissSequence: SequenceDef = sequenceDef({
	id: "pickup-tour-kiss",
	class: "exclusive",
	cast: {
		player: castRole("player"),
		quartermaster: castRole("npcByKnot", { knot: PickupTutor.root }),
	},
	root: seq(
		"kiss.root",
		moveTo("kiss.approach", {
			actor: "player",
			to: "quartermaster",
			arriveTolerance: 28,
		}),
		wait("kiss.beat", 0.5),
		dialogue("kiss.line", {
			knot: PickupTutor.pt_smooch,
			source: "player",
		}),
		focusOn("kiss.release", { target: "player", framing: FOLLOW }),
	),
});

let registered = false;

export const registerPickupTourOps = (): void => {
	if (registered) {
		return;
	}
	registered = true;
	registerOpType(
		SETUP_PICKUP_TOUR_QUEST,
		setupPickupTourQuestExecutor,
	);
};
