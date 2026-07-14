import type { Framing } from "../../engine/camera/framing";
import {
	type CutsceneDef,
	type CutsceneScene,
	MISSING_REQUIRED,
} from "../../engine/cutscene/cutscene";
import {
	beat,
	focusOn,
	parallel,
	step,
} from "../../engine/cutscene/verbs";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId, ReadonlyECS } from "../../engine/ecs";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { PickupTutor } from "../content/dialogue/knots.gen";
import {
	dialogue,
	escort,
	moveTo,
	release,
	say,
} from "../cutscene/verbs";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import {
	PICKUP_TYPES,
	PickupComponent,
	type PickupType,
} from "../pickup/pickup-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { QuestComponent } from "../quest/quest-component";
import { QuestMarkerTagComponent } from "../quest/quest-marker-tag-component";

export const PICKUP_TOUR_QUEST = "pickup_tour";
export const PICKUP_TOUR_TAG = "quest:pickup_tour";

type Cast = Readonly<
	{ player: EntityId; quartermaster: EntityId } & Partial<
		Record<PickupType, EntityId>
	>
>;

const INTRO: Framing = { zoom: 5, follow: true };
const EDGE: Framing = {
	zoom: 2,
	mode: "glide",
	duration: 1.5 as Seconds,
	follow: true,
};
const FOCUS: Framing = { zoom: 6 };
const SHAFT: Framing = {
	zoom: 1.5,
	mode: "glide",
	duration: 2 as Seconds,
	offsetTiles: new Vector2(0, -12),
};
const ROAD: Framing = {
	zoom: 6,
	mode: "glide",
	duration: 2.5 as Seconds,
	offsetTiles: new Vector2(-10, 0),
};
const WRAP: Framing = { zoom: 4 };
const FOLLOW: Framing = { zoom: 3, follow: true };

const pickupOf = (
	ecs: ReadonlyECS,
	type: PickupType,
): EntityId | undefined =>
	ecs.find(PickupComponent, (pickup) => pickup.type === type)?.[0];

const cast = (ecs: ReadonlyECS): Cast | typeof MISSING_REQUIRED => {
	const player = ecs.first(PlayerInputComponent)?.[0];
	const quartermaster = ecs.find(
		DialogueSourceComponent,
		(source) => source.knot === PickupTutor.root,
	)?.[0];
	if (player === undefined || quartermaster === undefined) {
		return MISSING_REQUIRED;
	}
	const pickups: Partial<Record<PickupType, EntityId>> = {};
	for (const type of PICKUP_TYPES) {
		const found = pickupOf(ecs, type);
		if (found !== undefined) {
			pickups[type] = found;
		}
	}
	return { player, quartermaster, ...pickups };
};

const requireActor = (
	id: EntityId | undefined,
	label: string,
): EntityId => {
	if (id === undefined) {
		throw new Error(
			`pickup-tour: required actor "${label}" is missing`,
		);
	}
	return id;
};

const requirePosition = (ecs: ECS, id: EntityId): Vector2 => {
	const transform = ecs.getComponent(id, TransformComponent);
	if (!transform) {
		throw new Error(
			`pickup-tour: actor ${id} has no transform (destroyed mid-cutscene?)`,
		);
	}
	return transform.position;
};

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

const intro: CutsceneScene<Cast> = function* (api, cast) {
	api.effect((ctx) => setupQuest(ctx.ecs));
	const dest = api.read((ctx) => {
		const pos = requirePosition(ctx.ecs, cast.quartermaster);
		return new Vector2(pos.x + 5.5 * TILE_SIZE, pos.y);
	});
	yield* step(api, "camera", (a) =>
		focusOn(a, cast.quartermaster, INTRO),
	);
	yield* step(api, "walk", (a) =>
		parallel(
			a,
			(s) => escort(s, cast.player, cast.quartermaster, dest),
			(s) =>
				dialogue(s, PickupTutor.pt_intro_walk, cast.quartermaster),
		),
	);
	yield* step(api, "edge", (a) =>
		focusOn(a, cast.quartermaster, EDGE),
	);
	yield* step(api, "talk", (a) =>
		say(a, cast.quartermaster, PickupTutor.pt_intro),
	);
};

const stop = (
	type: PickupType,
	panFraming?: Framing,
): CutsceneScene<Cast> =>
	function* (api, cast) {
		const pickup = requireActor(cast[type], type);
		yield* step(api, "focus", (a) => focusOn(a, pickup, FOCUS));
		yield* step(api, "line", (a) =>
			say(
				a,
				cast.quartermaster,
				PickupTutor.line[type],
				panFraming
					? { target: pickup, framing: panFraming }
					: undefined,
			),
		);
	};

const wrapUp: CutsceneScene<Cast> = function* (api, cast) {
	yield* step(api, "focus", (a) =>
		focusOn(a, cast.quartermaster, WRAP),
	);
	yield* step(api, "talk", (a) =>
		say(a, cast.quartermaster, PickupTutor.pt_wrap),
	);
	yield* step(api, "release", (a) => release(a, cast.player, FOLLOW));
};

const smooch: CutsceneScene<Cast> = function* (api, cast) {
	const approach = api.read((ctx) => {
		const target = requirePosition(ctx.ecs, cast.quartermaster);
		const from = requirePosition(ctx.ecs, cast.player);
		const side = Math.sign(from.x - target.x) || -1;
		return new Vector2(target.x + side * 28, target.y);
	});
	yield* step(api, "approach", (a) =>
		moveTo(a, cast.player, approach),
	);
	yield* step(api, "beat", () => beat(0.5 as Seconds));
	yield* step(api, "kiss", (a) =>
		say(a, cast.player, PickupTutor.pt_smooch),
	);
	yield* step(api, "release", (a) => release(a, cast.player, FOLLOW));
};

export const pickupTourCutscene: CutsceneDef<Cast> = {
	id: "pickup-tour",
	cast,
	scenes: [
		intro,
		stop("wall-slide"),
		stop("wall-jump", SHAFT),
		stop("dash", ROAD),
		stop("extra-jump"),
		wrapUp,
	],
};

export const pickupTourKissCutscene: CutsceneDef<Cast> = {
	id: "pickup-tour-kiss",
	cast,
	scenes: [smooch],
};
