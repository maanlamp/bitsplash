# Loot & Combat Design

Durable design principles for items, rarity, and combat resolution. Outlives any
single implementation plan.

## The item is five layers

Every item instance is data assembled from five layers. This anatomy is the
answer to "how do weapon parts translate to armor" — it generalizes to every
category:

1. **Category** — Weapon | Armor | Accessory.
2. **Archetype** — the base type (Longsword, Bow, Plate Cuirass). It defines a
   **part-slot schema**, base behavior, damage-type/mitigation role, and base
   visual. Different archetypes have different slots (a sword's `{blade, guard,
grip, pommel}` vs a cuirass's `{plating, lining, trim}`).
3. **Parts** — one per archetype slot. Each carries stat contributions, a
   damage-type lean, a **material**, and a quality weight. **Parts drive
   appearance** — a serrated blade looks serrated. Material is load-bearing: it
   drives visuals _and_, on armor, the resistance profile.
4. **Affixes** — rolled modifier lines, each with a tier and value range. The
   variance layer.
5. **Rarity** — Common/Uncommon/Rare/Epic.

## Two axes, not one ladder: rarity vs unique identity

"Legendary" conflates two orthogonal things; we keep them separate:

- **Procedural rarity** — the quality of a _randomly assembled_ item. Common →
  Epic. Gates affix-slot count and biases part quality.
- **Unique identity** — a _hand-authored_, named item with a fixed signature
  effect and curated part pool, source-locked, its own distinct visual class
  (not merely "a better Epic"). Uniques still roll numeric variance, so the
  god-roll chase lives _inside_ a fixed identity. Because sources are
  re-challengeable, every unique stays farmable.

## Rarity carries power — and that is deliberate

Rarity is an honest, at-a-glance power signal: higher is better. The consequence
is accepted head-on: **low-rarity instances become salvage fodder over time.**
"No straight-to-trash loot / every weapon has a reason" is therefore a claim at
the **archetype + matchup** level, not the individual-instance level. What keeps
this from becoming the "99% trash" firehose the genre is infamous for is
**sparsity** — few drops, each meaningful — plus a dignity hook so trash is never
_handled_ (junk auto-converts to a coin trickle).

Power also climbs by **source**: tougher enemies carry richer drop tables
(higher rarity odds + better part pools). That is the vertical curve — gear-
gated, with no level number.

## Storage: live references, recomputed

An item stores ids + rolled values (`{id, archetype, [partId], [{affixId,
rolledValue}], rarity, uniqueId?}`); definitions live in central registries;
stats
recompute on load. Tiny saves, one source of truth, and parts/affixes are
first-class movable atoms (which the future transplant system will exploit). A
def-id that no longer resolves skips its contribution and logs.

## Combat: damage types + material mitigation

- **Damage types** — physical subtypes (cleave/slash, blunt/crush, pierce/stab)
  plus elemental (fire, …). Weapons deal one or two types.
- **Mitigation** — `taken = raw × generalDR × typeMult[material][damageType]`,
  where `generalDR = armor/(armor+k)` and the matrix holds weak ×1.5 / resist
  ×0.5 / immune ×0, keyed on the armor's **material**. Materials are named after
  real stuff (chain/plate/scale/hide) so players guess the matrix without
  tooltips. Symmetric for player and enemies.
- **No shields** (wrong for medieval-fantasy) and **no durability, ever** — no
  system punishes the player for playing.

### The matchup is tactical spice, and rarity carries power — held apart by an invariant

Rarity-carries-power and matchup-as-live-decision share one number budget. The
invariant that keeps either from eating the other:

> A correct matchup is worth ~**one rarity tier** of effective DPS against a
> _resistant_ target, and ~zero against a neutral one.

Conditional, so swapping matters when it applies without flattening the rarity
climb. Every part/affix/rarity number is validated against this. The matchup is
demoted to a single job — tactical spice / a reason to swap — because rarity now
carries relevance; it is expressed as a **quick-swap loadout** (2–3 ready
weapons, instant swap) so swapping is a _combat verb_, never an inventory dive.

## Legibility is the product — but feedback is felt, not spelled out

Item **inspection** is exhaustively legible: parts and affixes both default-
visible, each with value, tier, and range; comparison vs equipped with delta
arrows; color reserved for rarity, keywords, and deltas. Never two items that
look identical when they differ.

Combat **feedback** stays minimal — no damage-number spam — but magnitude must
still be _learnable_, so it rides on feel: weak = meaty hit-stop + bright glyph,
resist = dull clang + shrunk glyph, immune = absorb-flash, plus a lightweight
per-enemy resist readout on inspect. Legibility wins over minimalism exactly
where the matchup lives.

## Optional spice, parked (not core)

Weak-points/hitzones, momentum→damage, and bypass rules ("bleed ignores armor")
are viable enrichments layered on the matrix later — not part of the core model.
