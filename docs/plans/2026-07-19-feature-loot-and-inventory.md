# Loot & Inventory System

- **Type:** feature
- **Date:** 2026-07-19
- **Status:** accepted

## Goal

Deliver a Borderlands-inspired loot loop and a spatial-grid inventory for the
player: enemies drop procedurally-assembled gear (weapons, armor, accessories)
built from inspectable **parts** + rolled **affixes**, gated by rarity, dropped
deterministically into persistent lootable corpses, equipped through a
quick-swap loadout, and resolved through a damage-type × material mitigation
system. Power is horizontal (no character or item level); the chase is the
god-roll. This plan ships the **core loop**; the catch-up/crafting layer is a
deliberately separate future plan.

## Context & problem

There is **no** inventory, item, equip, loot, or weapon-as-entity system today.
Weapons are baked into actor prefabs as components (`Bow`, `Melee`,
`DamageStats`); combat runs `resolveHit(stats, mods, rng)`
(`src/game/combat/resolve-hit.ts`) with an unused `HitModifiers`/`NO_MODIFIERS`
seam, emits `DamageEvent`, and `HealthSystem` applies it raw — there is no
mitigation layer, no damage types, no armor. The `give_item` ink binding
(`src/game/dialogue/ink-bindings.ts:46`) is a no-op stub awaiting a backend.
There is no seeded RNG (`src/engine/hash.ts` is a stateless position mixer) and
no particle system.

The engine is well-suited to the system: POJO components with
`@serializable`/`@serialize`, value types (nested serializable data) marked by a
`VALUE_TYPE` symbol, whole-world serialization with a strict provenance model
(journal-onto-scratch for authored scenes — no blocklists/scopes/`instanceof`),
prefab bundles as authored JSON, `EntityRef` id-references, a React→canvas UI
reconciler with Yoga + pointer input, and code-defined FSMs. Feasibility review
confirmed **every** element of this design is expressible within those rules
with no AGENTS.md violation.

The design was adversarially critiqued twice. The durable *why* behind the big
decisions is captured separately in `docs/design/` (see below); this plan is the
build checklist.

## Decision

Build the system in the shape below. Cross-cutting design principles live in
three standing design docs, authored alongside this plan:

- `docs/design/agency-and-determinism.md`
- `docs/design/loot-and-combat.md`
- `docs/design/progression-and-economy.md`

### Item model — five layers

An item instance is data (a value type), identical whether it sits in a world
corpse, an inventory grid, or an equip slot:

1. **Category** — `Weapon | Armor | Accessory`.
2. **Archetype** (base type, e.g. Longsword, Bow, Plate Cuirass) — defines a
   **part-slot schema**, base behavior, damage-type/mitigation role, and base
   visual. Longsword → `{blade, guard, grip, pommel}`; Bow → `{limbs, string,
   grip, rest}`; Cuirass → `{plating, lining, trim}`.
3. **Parts** — one per archetype slot. Each carries stat contributions, a
   damage-type lean, a **material** (drives appearance *and*, for armor, the
   resistance profile), and a quality weight. Parts drive appearance.
4. **Affixes** — 0–N rolled modifier lines, each with a tier and a value range.
5. **Rarity** — `Common | Uncommon | Rare | Epic`. Gates affix-slot count +
   biases part quality. **Rarity carries power.**

Orthogonal to rarity: an optional **Unique identity** — authored named items
(fixed signature effect + curated part pool), source-locked, their own distinct
visual class (not the top of the procedural ladder), still rolling numeric
variance so the god-roll chase lives inside a fixed identity.

**Storage = live references.** An item stores
`{ id, archetype, [partId…], [{affixId, rolledValue}…], rarity, uniqueId? }`;
part/affix/archetype/material *definitions* live in central registries; final
stats are recomputed on load. `id` is a stable serialized uuid (needed for
drag/drop, sell, and future transplant). A stored def-id that no longer resolves
→ skip that contribution + log (single-player, safe default).

### Determinism — kill-lock via a pure hash

A drop is `hash(worldSeed, victimEntityId, counter[victimId])`. Respawns
**reuse** the victim entity id (`spawn-system.ts:35` → `prefabs.ts:31`), so the
per-id counter advances per respawn → farming varies; save/load preserves the id
and restores the counter → the same kill yields the same item. This makes
"a save is a window into consistent history, not a fork into a parallel
universe" true by construction. There is **no stateful PRNG** — the only saved
state is a `Record<victimId, number>`. The shop restock uses the same primitive:
`hash(worldSeed, shopId, restockIndex)`.

### No level — source-gated horizontal power

No character level, no item-level number. Power climbs via rarity +
**source-gated part quality**: tougher enemy prefabs carry richer drop tables
(higher rarity odds + better part pools). A zone's "tier" simply falls out of
which enemy prefabs a scene places — **no zone/region abstraction is added**.
Difficulty comes from enemy AI + damage-type resistances + encounter design.
Progression *novelty* is delivered by story zones opening new build-space (new
archetypes/affix families/interactions), not bigger numbers. No meta-progression
board.

### Combat — damage types + material mitigation

- **Damage types:** physical subtypes (cleave/slash, blunt/crush, pierce/stab) +
  elemental (fire, …). Weapons deal 1–2 types.
- **Offense:** the equipped weapon *is* the item; base damage × part multipliers
  feed the existing `HitModifiers` seam. Player-only equips; enemies keep baked
  stats + a drop table.
- **Mitigation (new `game/armor/` slice):** `taken = raw × generalDR ×
  typeMult[material][damageType]`, where `generalDR = armor/(armor+k)` and the
  matrix holds weak ×1.5 / resist ×0.5 / immune ×0 keyed on armor **material**
  (named chain/plate/scale/hide so players guess it). A `MitigationSystem` sits
  immediately before `HealthSystem` and mutates `DamageEvent.amount` by its type
  tag. **Enemies** carry a single `ResistanceComponent` of prefab data. **The
  player's** profile is aggregated by `aggregate(...)` (step 6) from equipped
  armor: each piece yields an `armor` scalar and a per-type multiplier map (its
  structural-slot part's material sets the base column; other parts/affixes
  adjust it); across equipped pieces the `armor` scalars **sum** into
  `armor/(armor+k)` and the per-type maps **multiply** (clamped so stacked
  immunities can't invert to healing). Symmetric in *formula* for player and
  enemies; the two differ only in where the profile comes from. **No shields. No
  durability, ever.**
- **Balance invariant (load-bearing):** a correct matchup is worth ~**one rarity
  tier** of effective DPS against a *resistant* target and ~zero against a
  neutral one. Every part/affix/rarity number is validated against this — it is
  what keeps rarity-power and the matchup from eating each other.
- **Quick-swap loadout:** `LoadoutComponent { slots: ItemInstance[2..3];
  activeIndex }` on the player (rolled item instances, not registry defs);
  instant hotkey/wheel swap via new `ACTION_IDS` + `actions.fired(...)`. The
  matchup is a live combat verb. Armor/accessories change through the
  anytime-openable inventory window.
- **Feedback:** minimal hitsplats, no damage numbers; magnitude rides on *feel*
  (weak = meaty hit-stop + bright glyph, resist = dull clang + shrunk glyph,
  immune = absorb-flash) plus a lightweight per-enemy resist readout on inspect.

### Inventory, collection, inspection

- **Spatial grid:** WxH occupancy on a component, item footprints, **no
  rotation**, modest footprints (illustrative, to be tuned: most items 1×1/1×2,
  big weapons/armor ~2×2), auto-arrange. Small and generous, not Tarkov.
  Fungibles (coins) auto-vacuum.
- **Collection:** enemy death → a **persistent** loot-corpse entity + a faked
  rarity beam (additive sprite quad + ground glow + rising motes via the
  transient-spawn pattern; **explicit code marker: should be particle-powered
  later**), colored by the best item inside. A **non-blocking** review window
  (world stays live), openable anytime (agency); take what you want, leave the
  rest; corpse persists so nothing is lost to terrain. Single-item shortcut
  skips the window.
- **Inspection card:** parts + affixes both default-visible; per-modifier value,
  tier, range; sticky-toggle comparison vs equipped with delta arrows; color
  reserved for rarity + keywords + deltas. Same card in corpse-review, grid, and
  equip.
- **Rarity UI:** four tiers coloring name/border/beam with escalating flourish
  (glow → pulsing border → brighter beam + sound); Unique is the distinct,
  loudest class.
- **QoL (scoped to sparse volume — no loot-filter engine):** lock/favorite
  (protects from sell), junk-tag → bulk-sell, and junk-tagged items auto-convert
  to a coin trickle on pickup (so trash is never *handled*).

### Economy — single currency

Coins only. Sell unwanted gear → coins. Merchants **sell gear from their own
restocking, rarity-gated loot pool** (a parallel RNG loot channel + coin sink —
"did today's restock roll the legendary?"), restock deterministic per
`(shop, restockIndex)`, plus consumables. **No ammunition items** (ranged is
unconstrained — ammo-as-item is lose-lose tedium). No materials, salvage-verb,
reroll, transplant, or pity — those are the deferred catch-up plan.

## Alternatives considered

- **Rarity encodes complexity, not power** — rejected: the designer chose rarity
  as an honest power signal and accepted that low-rarity *instances* become
  salvage fodder (sparsity prevents a trash-shower); "every weapon has a reason"
  holds at the archetype + matchup level.
- **Character/item level** — rejected repeatedly: any level term that multiplies
  item base values mathematically guarantees old gear falls behind, recreating
  the trash treadmill the design most wanted to avoid. Power is horizontal +
  gear-gated.
- **Fresh roll per kill (reroll on reload)** — rejected in favor of kill-lock,
  not to prevent "save-scumming" (a non-concept here — player agency is a
  principle) but so the world reads as consistent history.
- **Stateful seeded PRNG** — rejected: a pure hash over a persisted counter has
  no runtime state to snapshot, making reload-determinism true by construction.
- **Stackable-slot and categorized-list inventories** — rejected: unique rolled
  gear can't stack; a spatial grid was chosen for immersion, de-tediumed by
  no-rotation + modest footprints + sparse drops.
- **Shields / armor-rating / depletable-armor / accuracy-roll mitigation** —
  rejected: shields don't fit medieval-fantasy; a material × type multiplier
  matrix is the legible, literal encoding of the intended resist/weak/immune.
- **Impossible-combo transplant, meta-progression board, loot filters** —
  rejected/deferred: catch-up crafting is a separate plan; the board and filters
  are unnecessary for a sparse, story-driven loop.

## Approach / steps

Phases are ordered; Phase 2 workstreams parallelize once the Phase 0 contract is
fixed. The shared contract is the **item value-types + registries + the
`aggregate(...) → finalStats` pure function + the generation entry point**.

### Phase 0a — scaffolding (serial, blocking)

1. **RNG primitive** — add `src/engine/rng/` with a stateless mixer:
   FNV-1a `string→u32` for uuids + a splitmix/PCG finalizer; `roll(worldSeed,
   key…) → [0,1)`; per-domain salts (loot/combat/cosmetic) so streams can't
   desync. No `UpdateContext` change required for the pure-hash form.
2. **`LootLedgerComponent { seed: number; counters: Record<string,number> }`** —
   a persistent singleton created in `newGameSeed`
   (`src/game/runtime/new-game-seed.ts`), captured by `Runtime.snapshot()`'s
   persistent bucket. Never a scene-document entity (provenance-safe).
3. **Item value-types + registries** — `ItemInstance` (with stable `id`),
   `PartInstance`, `AffixInstance` as `@serializable` value types; archetype /
   part / affix / material *definition* registries as code-defined tables with a
   manual-registration shim (mirroring `quest/loader.ts`) so `bun test` can load
   them without `import.meta.glob`.
4. **Round-trip test** — headless: build an item, serialize a world holding it
   (in a component array), restore, assert identical recomputed stats. Also
   assert an item with a missing def-id skips that contribution + logs.

### Phase 0b — the spine (serial, blocking)

5. **Content schema** — per-archetype part-slot schemas; part stat
   contributions + damage-type leans + materials; affix ranges + tiers; the
   material × damage-type mitigation matrix; quality weighting; the rarity
   procedure. (This is the design-heavy milestone, not a footnote.)
6. **`aggregate(archetype, parts, affixes, rarity) → finalStats`** — the pure
   stat function: `(base + Σflat) × (1 + Σincreased) × Π(1 + more)`, feeding
   `HitModifiers` for weapons. For **armor** its output is a
   `{ armor: number, typeMult: Record<damageType, number> }` profile (the
   structural-slot part's material sets the base `typeMult` column; other
   parts/affixes adjust it) — the shape the player-side `MitigationSystem`
   consumes and combines across equipped pieces (sum `armor`, multiply
   `typeMult`, clamp).
7. **Generation** — rarity-first: roll rarity from a source's drop table, then
   parts (quality biased by rarity + source), then affixes; all via the Phase-0a
   hash keyed on `(victimId, counter)`. Drop tables are weighted/nested/named,
   with "no-drop" as an explicit entry.

### Phase 1 — vertical slice (mostly serial)

8. One weapon archetype + a handful of parts/affixes; one enemy prefab carrying
   a drop table + a `ResistanceComponent`; a `LootSystem` placed in
   `gameplaySystems` **after `HealthSystem` and before the post-update destroy
   flush** (so it reads `DeathEvent` and the victim's still-queryable
   `TransformComponent` — the flush is deferred) and spawns a persistent corpse
   with a faked beam; press → collect into a minimal grid; equip via
   `LoadoutComponent` **including the quick-swap action wiring** (new
   `ACTION_IDS` entries + `actions.fired("weapon.next"/slots)` driving
   `activeIndex`); `MitigationSystem` before `HealthSystem`; damage types
   threaded through `resolve-hit.ts`, `damage-stats-component.ts`,
   `arrow-component.ts`, `bow-system.ts`, `melee-system.ts`, `arrow-system.ts`,
   `events.ts`; the basic inspection card.
   - **Acceptance criteria:** combat *feel* is validated in the real app; ≥1
     encounter demonstrates element-swap measurably beating no-swap (the matchup
     demotion is only valid if this holds — else cut the damage-type system).
     Loot-loop *fairness* is explicitly **not** under test here (it runs its
     highest-variance config with the catch-up layer deferred).

### Phase 2 — breadth (parallelizable on the contract)

- **Content stream** — full archetypes/parts/affixes/materials across weapons,
  armor, accessories; named uniques + source-locked drop; drop tables per enemy
  prefab.
- **Inventory/UI stream** — the spatial-grid inventory, inspection card,
  sticky-toggle compare, equip/loadout UI, corpse-review window. Genuinely new
  UI work on the existing reconciler: pointer **drag** (capture + a
  DynStore-driven drag-ghost), **scroll**, and the first real `setModal` /
  screen-space panel.
- **Economy stream** — sell→coins, merchant + restocking loot-pool (deterministic
  restock), buy; lock/favorite + junk-tag → bulk-sell + auto-convert.

### Phase 3 — wiring + polish

- Author the real content; wire `give_item` (emit `GiveItemEvent`, consume in an
  inventory system, mirroring `start_quest`); beam juice; the per-enemy resist
  readout on inspect; feel-based hit feedback pass.

## Research findings that drove this

- **Codebase:** respawns *reuse* the entity id (`death-system.ts:21` →
  `spawn-system.ts:31-36` → `prefabs.ts:26-32`) — this is what makes kill-lock a
  pure hash over a per-id counter rather than a fragile PRNG snapshot. Value-type
  arrays serialize generically (`serialization/value.ts`; precedent
  `render-layers-component.ts`). Recompute-on-load precedent:
  `tilemap/tile-layer-component.ts`. Per-prefab data tables precedent:
  `DamageStats` in `enemy.prefab.json`. The UI reconciler already has pointer
  hit-testing, a `Grid`, and unused `setModal`; only drag/scroll are new. There
  is no zone concept — tier falls out of prefab placement.
- **Prior art:** the near-universal model is *base template + rolled instances*
  (PoE affixes; Borderlands part recipes) — never a pre-baked stat blob. Stat
  aggregation `(base + Σflat) × (1 + Σincreased) × Π(1 + more)`. Drop tables =
  weighted pools
  with explicit "no-drop". For unique rolled gear, spatial grid or list (not
  stackable). Deterministic loot = hash over stable coordinates, not a global
  stream.
- **Player sentiment:** fewer/louder drops; trash never a firehose; legibility
  is the product (show the parts, value/tier/range, never two items that look
  identical when they differ); build-defining > bigger numbers; RNG on
  acquisition, agency on the finish (which the deferred crafting plan owns).
- **Mitigation prior art:** RuneScape (type-on-accuracy), Bannerlord (soak +
  per-type penetration), Monster Hunter (hitzones), Warframe
  (`armor/(armor+k)` + type matrix + bypass), Souls (capped % absorption),
  Battle Brothers/DOS2 (depletable layer). The material × type multiplier matrix
  was chosen as the legible, literal encoding of resist/weak/immune;
  weak-points/momentum/bypass are parked as optional spice.

## Risks & open questions

- **Combat is a load-bearing dependency this plan does not fully design.** The
  whole loop assumes combat feel is pristine and the matchup is a real decision.
  Phase 1 exists to de-risk exactly this; its acceptance criteria gate the rest.
- **The F1 exchange-rate invariant** (matchup ≈ one rarity tier) must hold across
  all tuning, or rarity-power and the matchup collapse one into the other.
- **"Sparse-trash feels OK" is an unvalidated bet** — a rare drop resolving to
  low-rarity stings more per event; the auto-convert-to-coins dignity hook and
  sparsity are the mitigations, to be confirmed in playtest.
- **Re-challengeable bosses** are assumed to exist (for the unique god-roll
  chase); that mechanic is a separate, already-intended feature, not built here.
- **Merchant restock cadence** (time/visits/story beats) is a tuning question.
- **`LootLedger` counter map** grows slowly with distinct one-shot enemies —
  acceptable; noted.
- **Env-kills drop loot** (loot is a property of the enemy, not the killer) —
  confirmed intended.
