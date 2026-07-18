import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { getPickIndex } from "../pick-index";

/**
 * Maintains the shown world's {@link import("../pick-index").PickIndex} once per
 * frame, before the entity editor picks against it (plan C1). All the geometry
 * recompute happens here — for dirty/created/destroyed entities only — so
 * picking itself is a pure broad-phase query.
 */
export class EntityAabbSystem implements UpdateSystem {
	update({ ecs, assetManager }: UpdateContext): void {
		getPickIndex(ecs).maintain(assetManager);
	}
}
