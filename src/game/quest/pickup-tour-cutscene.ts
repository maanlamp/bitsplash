import type {
	CutsceneApi,
	CutsceneDef,
	CutsceneScene,
} from "../../engine/cutscene/cutscene";
import {
	cameraTo,
	parallel,
	step,
	wait,
} from "../../engine/cutscene/verbs";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { dialogue, escort, moveTo, walkTo } from "../cutscene/verbs";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import {
	PickupComponent,
	type PickupType,
} from "../pickup/pickup-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { QuestComponent } from "../quest/quest-component";
import { QuestMarkerTagComponent } from "../quest/quest-marker-tag-component";

export const PICKUP_TOUR_QUEST = "pickup_tour";
export const PICKUP_TOUR_TAG = "quest:pickup_tour";

const TOUR_ORDER: ReadonlyArray<PickupType> = [
	"wall-slide",
	"wall-jump",
	"dash",
	"extra-jump",
];

const FOCUS_ZOOM = 6;
const INTRO_ZOOM = 5;
const EDGE_ZOOM = 2;
const DEFAULT_FOLLOW_ZOOM = 3;
const SHAFT_ZOOM = 1.5;
const SHAFT_PAN_TILES = 12;
const WRAP_ZOOM = 4;
const ROAD_SWEEP_TILES = 10;

const pickupOf = (ecs: ECS, type: PickupType): EntityId | null => {
	for (const [id, pickup] of ecs.query(PickupComponent)) {
		if (pickup.type === type) {
			return id;
		}
	}
	return null;
};

const playerId = (ecs: ECS): EntityId | null =>
	ecs.query(PlayerInputComponent)[0]?.[0] ?? null;

const quartermasterId = (ecs: ECS): EntityId | null => {
	for (const [id, source] of ecs.query(DialogueSourceComponent)) {
		if (source.knot === "pickup_tutor") {
			return id;
		}
	}
	return null;
};

const positionOf = (ecs: ECS, id: EntityId): Vector2 | null =>
	ecs.getComponent(id, TransformComponent)?.position ?? null;

const lineFor = (type: PickupType): string =>
	`pickup_tutor.pt_line_${type.replaceAll("-", "_")}`;

const setupQuest = (ecs: ECS): void => {
	let count = 0;
	for (const type of TOUR_ORDER) {
		const id = pickupOf(ecs, type);
		if (id === null) {
			continue;
		}
		count += 1;
		ecs.addComponent(
			id,
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

const intro: CutsceneScene = function* (api) {
	api.effect((ctx) => setupQuest(ctx.ecs));
	const quartermaster = api.read((ctx) => quartermasterId(ctx.ecs));
	const player = api.read((ctx) => playerId(ctx.ecs));
	const position = api.read((ctx) =>
		quartermaster ? positionOf(ctx.ecs, quartermaster) : null,
	);
	if (quartermaster === null || !position) {
		return;
	}
	yield* step(api, "camera", (a) =>
		cameraTo(a, {
			target: quartermaster,
			zoom: INTRO_ZOOM,
			followAfter: [quartermaster],
		}),
	);
	const dest = position.x + 5.5 * TILE_SIZE;
	yield* step(api, "walk", (a) =>
		parallel(
			player !== null
				? escort(
						a,
						player,
						quartermaster,
						new Vector2(dest, position.y),
					)
				: walkTo(quartermaster, dest),
			dialogue(a, "pickup_tutor.pt_intro_walk", quartermaster),
		),
	);
	yield* step(api, "edge", (a) =>
		cameraTo(a, {
			target: quartermaster,
			zoom: EDGE_ZOOM,
			mode: "glide",
			duration: 1.5 as Seconds,
			followAfter: [quartermaster],
		}),
	);
	yield* step(api, "talk", (a) =>
		dialogue(a, "pickup_tutor.pt_intro", quartermaster),
	);
};

const stop = (type: PickupType): CutsceneScene =>
	function* (api: CutsceneApi) {
		const pickup = api.read((ctx) => pickupOf(ctx.ecs, type));
		if (pickup === null) {
			return;
		}
		const quartermaster = api.read((ctx) => quartermasterId(ctx.ecs));
		yield* step(api, "focus", (a) =>
			cameraTo(a, { target: pickup, zoom: FOCUS_ZOOM }),
		);
		yield* step(api, "line", (a) =>
			dialogue(a, lineFor(type), quartermaster),
		);
	};

const stopWallJump: CutsceneScene = function* (api) {
	const pickup = api.read((ctx) => pickupOf(ctx.ecs, "wall-jump"));
	const position = api.read((ctx) =>
		pickup ? positionOf(ctx.ecs, pickup) : null,
	);
	if (pickup === null || !position) {
		return;
	}
	const quartermaster = api.read((ctx) => quartermasterId(ctx.ecs));
	yield* step(api, "focus", (a) =>
		cameraTo(a, { target: pickup, zoom: FOCUS_ZOOM }),
	);
	yield* step(api, "line", (a) =>
		parallel(
			dialogue(a, lineFor("wall-jump"), quartermaster),
			cameraTo(a, {
				target: new Vector2(
					position.x,
					position.y - SHAFT_PAN_TILES * TILE_SIZE,
				),
				zoom: SHAFT_ZOOM,
				mode: "glide",
				duration: 2 as Seconds,
			}),
		),
	);
};

const stopDash: CutsceneScene = function* (api) {
	const pickup = api.read((ctx) => pickupOf(ctx.ecs, "dash"));
	const position = api.read((ctx) =>
		pickup ? positionOf(ctx.ecs, pickup) : null,
	);
	if (pickup === null || !position) {
		return;
	}
	const quartermaster = api.read((ctx) => quartermasterId(ctx.ecs));
	yield* step(api, "focus", (a) =>
		cameraTo(a, { target: pickup, zoom: FOCUS_ZOOM }),
	);
	yield* step(api, "line", (a) =>
		parallel(
			dialogue(a, lineFor("dash"), quartermaster),
			cameraTo(a, {
				target: new Vector2(
					position.x - ROAD_SWEEP_TILES * TILE_SIZE,
					position.y,
				),
				zoom: FOCUS_ZOOM,
				mode: "glide",
				duration: 2.5 as Seconds,
			}),
		),
	);
};

const wrapUp: CutsceneScene = function* (api) {
	const player = api.read((ctx) => playerId(ctx.ecs));
	const quartermaster = api.read((ctx) => quartermasterId(ctx.ecs));
	if (player === null) {
		return;
	}
	if (quartermaster !== null) {
		yield* step(api, "focus", (a) =>
			cameraTo(a, { target: quartermaster, zoom: WRAP_ZOOM }),
		);
	}
	yield* step(api, "talk", (a) =>
		dialogue(a, "pickup_tutor.pt_wrap", quartermaster),
	);
	yield* step(api, "release", (a) =>
		cameraTo(a, {
			target: player,
			zoom: DEFAULT_FOLLOW_ZOOM,
			followAfter: [player],
		}),
	);
};

const smooch: CutsceneScene = function* (api) {
	const player = api.read((ctx) => playerId(ctx.ecs));
	const quartermaster = api.read((ctx) => quartermasterId(ctx.ecs));
	const target = api.read((ctx) =>
		quartermaster ? positionOf(ctx.ecs, quartermaster) : null,
	);
	const from = api.read((ctx) =>
		player ? positionOf(ctx.ecs, player) : null,
	);
	if (player === null || !target || !from) {
		return;
	}
	const side = Math.sign(from.x - target.x) || -1;
	yield* step(api, "approach", (a) =>
		moveTo(a, player, new Vector2(target.x + side * 28, target.y)),
	);
	yield* step(api, "beat", () => wait(0.5 as Seconds));
	yield* step(api, "kiss", (a) =>
		dialogue(a, "pickup_tutor.pt_smooch", player),
	);
	yield* step(api, "release", (a) =>
		cameraTo(a, {
			target: player,
			zoom: DEFAULT_FOLLOW_ZOOM,
			followAfter: [player],
		}),
	);
};

export const pickupTourCutscene: CutsceneDef = {
	id: "pickup-tour",
	scenes: [
		intro,
		stop("wall-slide"),
		stopWallJump,
		stopDash,
		stop("extra-jump"),
		wrapUp,
	],
};

export const pickupTourKissCutscene: CutsceneDef = {
	id: "pickup-tour-kiss",
	scenes: [smooch],
};
