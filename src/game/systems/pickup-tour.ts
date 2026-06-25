import { Camera2DComponent } from "../../engine/components/camera-2d";
import { Camera2DFollowComponent } from "../../engine/components/camera-2d-follow";
import { DialogueComponent } from "../../engine/components/dialogue";
import { ScreenFadeComponent } from "../../engine/components/screen-fade";
import { TagsComponent } from "../../engine/components/tags";
import { TransformComponent } from "../../engine/components/transform";
import type { ECS, EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import {
	PICKUP_TYPES,
	PickupComponent,
	type PickupType,
} from "../components/pickup";
import { PlayerInputComponent } from "../components/player-input";
import {
	PickupTourComponent,
	type TourTarget,
} from "../components/pickup-tour";
import { QuestComponent } from "../components/quest";

export const PICKUP_TOUR_QUEST = "pickup_tour";
export const PICKUP_TOUR_TAG = "quest:pickup_tour";

const setDialogueHold = (ecs: ECS, hold: boolean): void => {
	const dialogue = ecs.query(DialogueComponent)[0];
	if (dialogue) {
		dialogue[1].hold = hold;
	}
};

const tagPickup = (ecs: ECS, id: EntityId): void => {
	const tags = ecs.getComponent(id, TagsComponent);
	if (tags) {
		if (!tags.has(PICKUP_TOUR_TAG)) {
			tags.tags.push(PICKUP_TOUR_TAG);
		}
		return;
	}
	ecs.addComponent(id, new TagsComponent([PICKUP_TOUR_TAG]));
};

const selectTour = (ecs: ECS): TourTarget[] => {
	const byType = new Map<PickupType, EntityId[]>();
	for (const [id, pickup] of ecs.query(
		PickupComponent,
		TransformComponent,
	)) {
		const list = byType.get(pickup.type) ?? [];
		list.push(id);
		byType.set(pickup.type, list);
	}
	const queue: TourTarget[] = [];
	for (const type of PICKUP_TYPES) {
		const list = byType.get(type);
		if (!list || list.length === 0) {
			continue;
		}
		const id = list[Math.floor(Math.random() * list.length)]!;
		queue.push({ id, type });
	}
	return queue;
};

export const beginPickupTour = (ecs: ECS): void => {
	if (ecs.query(PickupTourComponent)[0]) {
		return;
	}
	const queue = selectTour(ecs);
	for (const target of queue) {
		tagPickup(ecs, target.id);
	}
	for (const [, quest] of ecs.query(QuestComponent)) {
		if (quest.questId === PICKUP_TOUR_QUEST) {
			quest.counters[PICKUP_TOUR_TAG] = 0;
			quest.goals[PICKUP_TOUR_TAG] = queue.length;
		}
	}
	ecs.createEntity([
		new PickupTourComponent(queue),
		new ScreenFadeComponent(0),
	]);
};

export const nextPickup = (ecs: ECS): string => {
	const entry = ecs.query(PickupTourComponent)[0];
	if (!entry) {
		return "";
	}
	const tour = entry[1];
	const target = tour.queue.shift();
	if (!target) {
		return "";
	}
	tour.current = target;
	tour.returning = false;
	tour.phase = "out";
	tour.elapsed = 0 as typeof tour.elapsed;
	setDialogueHold(ecs, true);
	return target.type;
};

export const endPickupTour = (ecs: ECS): void => {
	const entry = ecs.query(PickupTourComponent)[0];
	if (!entry) {
		return;
	}
	const tour = entry[1];
	tour.current = null;
	tour.returning = true;
	tour.phase = "out";
	tour.elapsed = 0 as typeof tour.elapsed;
	setDialogueHold(ecs, true);
};

export class PickupTourSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const entry = ecs.query(
			PickupTourComponent,
			ScreenFadeComponent,
		)[0];
		if (!entry) {
			return;
		}
		const [tourId, tour, fade] = entry;
		const dtSeconds = dt / 1000;

		if (tour.phase === "out") {
			tour.elapsed = (tour.elapsed +
				dtSeconds) as typeof tour.elapsed;
			fade.alpha = Math.min(1, tour.elapsed / tour.fadeOut);
			if (tour.elapsed >= tour.fadeOut) {
				this.swap(ecs, tour);
				tour.phase = "in";
				tour.elapsed = 0 as typeof tour.elapsed;
			}
			return;
		}

		if (tour.phase === "in") {
			tour.elapsed = (tour.elapsed +
				dtSeconds) as typeof tour.elapsed;
			fade.alpha = Math.max(0, 1 - tour.elapsed / tour.fadeIn);
			if (tour.elapsed >= tour.fadeIn) {
				fade.alpha = 0;
				setDialogueHold(ecs, false);
				if (tour.returning) {
					ecs.destroyEntity(tourId);
				} else {
					tour.phase = "idle";
				}
			}
		}
	}

	private swap(ecs: ECS, tour: PickupTourComponent): void {
		const entry = ecs.query(
			Camera2DComponent,
			Camera2DFollowComponent,
		)[0];
		if (!entry) {
			return;
		}
		const camera = entry[1].camera;
		const follow = entry[2];

		if (tour.returning) {
			const playerId =
				ecs.query(PlayerInputComponent)[0]?.[0] ?? null;
			if (playerId !== null) {
				follow.targets = [playerId];
			}
			const transform = playerId
				? ecs.getComponent(playerId, TransformComponent)
				: null;
			if (transform) {
				camera.position.copy(transform.position);
			}
			camera.zoom = follow.zoom;
			camera.clampZoom();
			return;
		}

		follow.targets = [];
		const transform = tour.current
			? ecs.getComponent(tour.current.id, TransformComponent)
			: null;
		if (transform) {
			camera.position.copy(transform.position);
		}
		camera.zoom = tour.focusZoom;
		camera.clampZoom();
	}
}
