import type { ECS, EntityId } from "../../engine/ecs";
import { EmitterComponent } from "../../engine/vfx/emitter-component";
import Vector2 from "../../engine/vector2";
import { type VfxDefId, VFX_IDS } from "./vfx-ids";

/**
 * The loot beam seam: the one way anything asks for a rarity beam.
 *
 * Loot owns *which* class a drop is; this slice owns what that looks like. The
 * two meet at {@link spawnLootBeam} and nowhere else, so retuning a beam, adding
 * a helix or swapping a def never reaches the loot code.
 */

/** The visual classes a beam can be, dimmest first. */
export const LOOT_VISUAL_CLASSES = [
	"common",
	"uncommon",
	"rare",
	"epic",
	"unique",
] as const;

/**
 * How loud a drop's beam is.
 *
 * Five named classes rather than a tier number: `unique` is the loudest class in
 * the loot design rather than a fourth step up from `epic`, and a numeric
 * parameter would cap the ceiling in the wrong place.
 */
export type LootVisualClass = (typeof LOOT_VISUAL_CLASSES)[number];

/**
 * Which effect each class beams. Keyed by {@link LootVisualClass}, so a sixth
 * class is a `tsc` error here rather than a beam that silently fails to appear.
 */
const BEAM_DEFS = {
	common: VFX_IDS.lootBeamCommon,
	uncommon: VFX_IDS.lootBeamUncommon,
	rare: VFX_IDS.lootBeamRare,
	epic: VFX_IDS.lootBeamEpic,
	unique: VFX_IDS.lootBeamUnique,
} as const satisfies Readonly<Record<LootVisualClass, VfxDefId>>;

/** Beam origin above the host's transform, world units. */
const BEAM_OFFSET_Y = -4;

/**
 * Mark an entity with the beam of a visual class.
 *
 * The beam is an {@link EmitterComponent} on the entity itself — the runtime
 * half of "authored on scene entities or added to runtime entities". Everything
 * that makes a hosted effect behave falls out of that: it rides the host,
 * appears at full population on its first frame (seed-by-age), re-derives after
 * a save/restore, hot-reloads while the game runs, and **lives out** when the
 * host is destroyed, its geometry ageing out through each part's authored alpha
 * track rather than blinking away.
 *
 * Replacing the class replaces the component, and the store rebuilds the effect
 * the next frame because the def identity changed.
 *
 * @example
 * spawnLootBeam(ecs, drop, "epic");
 */
export const spawnLootBeam = (
	ecs: ECS,
	entity: EntityId,
	visualClass: LootVisualClass,
): void => {
	const emitter = new EmitterComponent();
	emitter.defId = BEAM_DEFS[visualClass];
	emitter.offset = new Vector2(0, BEAM_OFFSET_Y);
	ecs.addComponent(entity, emitter);
};
