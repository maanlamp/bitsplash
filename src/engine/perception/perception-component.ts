import Angle from "../angle";
import { Duration } from "../duration";
import type { EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type Vector2 from "../vector2";

export type SightSample = {
	x: number;
	y: number;
	blocked: boolean;
};

@serializable("Perception")
export class PerceptionComponent {
	@serialize() viewDistanceTiles: number;
	@serialize() viewAngle: Angle;
	@serialize({ group: "timing" }) detectTime: Duration;
	@serialize({ group: "timing" }) forgetTime: Duration;

	@serialize() targetId: EntityId | null = null;
	@serialize() detection: number = 0;
	canSeeTarget: boolean = false;
	@serialize() lastStimulusPos: Vector2 | null = null;
	@serialize() timeSinceStimulus: number = 0;
	@serialize() timeSinceSeen: number = Infinity;
	@serialize() timeSinceDamage: number = Infinity;
	sightSamples: SightSample[] = [];

	/**
	 * Everything this perceiver is currently aware of, with **no faction-stance
	 * filter** — deliberately unlike {@link targetId}, which keeps the hostile
	 * filter so combat targeting never latches onto a same-faction neighbour.
	 * This is what reactions read: an NPC's stance toward the player is
	 * `"neutral"`, so a stance-filtered set would leave every reaction inert.
	 *
	 * Awareness is *sticky*: an entity joins on clear line of sight and stays
	 * while it is either still sighted or within
	 * {@link noticeProximityTiles} — see that field for why.
	 *
	 * Serialized so a restored snapshot does not report everything already in
	 * view as freshly noticed and re-fire every reaction.
	 */
	@serialize() noticed: EntityId[] = [];

	/** Entities that joined {@link noticed} this frame. Rebuilt every frame. */
	noticedEntered: EntityId[] = [];
	/** Entities that left {@link noticed} this frame. Rebuilt every frame. */
	noticedExited: EntityId[] = [];

	/**
	 * How near an **already-noticed** entity may stay to remain in
	 * {@link noticed} with no line of sight at all, in tiles.
	 *
	 * Awareness of somebody standing next to you does not end when you look
	 * elsewhere. Without this, an NPC sweeping its head drops the player and
	 * re-notices them a second later, and every downstream consumer reads that as
	 * "they left and came back". Comfortably wider than the view cone, so turning
	 * around never crosses it and the boundary can only be crossed by actually
	 * walking away — the hysteresis is what keeps a farewell from firing on a
	 * flicker.
	 *
	 * Entry into {@link noticed} still requires cone and clear sight; this only
	 * governs how an entity leaves.
	 */
	@serialize() noticeProximityTiles: number;

	constructor(
		viewDistanceTiles: number = 8,
		viewAngle: number = Math.PI / 5,
		detectTime: number = 0.5,
		forgetTime: number = 4,
		noticeProximityTiles: number = 10,
	) {
		this.viewDistanceTiles = viewDistanceTiles;
		this.viewAngle = new Angle(viewAngle);
		this.detectTime = new Duration(detectTime);
		this.forgetTime = new Duration(forgetTime);
		this.noticeProximityTiles = noticeProximityTiles;
	}
}
