# Progression & Economy Design

Durable principles for how the player grows stronger and how loot converts into
progress. Outlives any single plan.

## Power is horizontal: no levels

There is **no character power level and no item level** as a numeric power
factor. Any XP/level system that exists is horizontal: it unlocks _abilities_ and
never multiplies item base values. This is a deliberate, hard-won choice:

> Any level term that multiplies item base values _mathematically guarantees_
> old gear falls behind, because level always rises. That is the trash treadmill
> we are avoiding at the root.

Power instead comes from **gear + build + player skill**. Relevance is
situational (the damage-type matchup), build-driven (synergy), and
identity-driven (what a weapon _does_). None of those is obsoleted by a rising
number.

## Progression still climbs, via source-gating and novelty

"No levels" does not mean "no progression":

- **Vertical, gear-gated:** tougher sources (enemies, bosses, zones) carry
  richer drop tables, so gear power climbs as you take on harder content. A
  zone's tier simply falls out of which enemy prefabs it places, so there is no
  separate zone/region system.
- **Novelty:** each story zone opens new build-space (new archetypes, new affix
  families, new damage-type interactions), so later content gives _new toys_
  rather than bigger numbers. This is the renewable climb for a narrative game;
  there is deliberately no meta-progression or collection board bolted on.
- **Difficulty** comes from enemy AI quality, damage-type resistances, and
  encounter design, not a stat arms race.

## Difficulty is authored, not scaled

The primary difficulty lever is qualitative: stronger enemies get smarter AI and
more/stronger resistances, not just bigger numbers. Combat is not filler between
story beats; it is the loop the story is poured over (see the
[GDD's core loop](./game-design-document.md#core-loop)). It is deliberate rather
than twitch, and the loot chase only feels good if the combat feeding it does.

## The chase, and the catch-up family (deferred together)

The endgame is the **god-roll chase**: farming re-challengeable sources for the
best roll of the gear (and named uniques) you want. Farming, including
over-farming, is the player's choice and is meant to be fun. Farming itself is the
catch-up lever: an unlucky player kills again.

Everything that "closes the luck gap without the luck" is **one family**, and it
is deferred to its own future plan so it can be designed together against
playtest data:

- pity / bad-luck protection,
- affix reroll,
- harvest / transplant (moving a rolled part between items),
- crafting materials + the salvage verb.

They are deferred as a unit precisely because they interact; shipping one in
isolation would pre-commit the others. The core loop ships without them.

## Economy: a single currency, and the shop is a loot source

- **Coins only.** Sell unwanted gear → coins.
- **Merchants sell gear from their own restocking loot pool** — a rarity-gated
  stock that refreshes on a cadence, deterministic per restock (same history
  primitive as drops). Shopping is its own loop: "did today's restock roll the
  legendary?" It is a _parallel RNG loot channel_ + a coin sink, not a
  deterministic buy-what-you-need catch-up, so it neither undercuts drops nor
  smuggles in the deferred catch-up family.
- **No ammunition as items.** Ranged is just another combat option to experiment
  with; ammo-accounting is lose-lose (punishing → tedium; trivial → pointless).
- **Trash has dignity:** junk-tagged items auto-convert to a coin trickle on
  pickup, so low-rarity fodder is never _handled_.

## Inventory posture

A **spatial grid** (no rotation, modest footprints, auto-arrange), chosen for
immersion and de-tediumed by those constraints plus sparse drops so it never
becomes inventory-tetris. Constrained capacity is a _fun_ choice, never punishing;
nothing is ever lost (persistent corpses). QoL is scoped to sparse volume:
lock/favorite, junk-tag → bulk-sell, compare-vs-equipped. No loot-filter engine,
which is a firehose-mitigation this game doesn't need.
