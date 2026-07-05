# Damage Resolution & Hitsplats — Architectural Plan

Status: **planned** (no implementation yet). Covers damage stat/roll/outcome
separation, crit mechanics, floating damage numbers ("hitsplats") with crit
flavour text, and shake integration. Deliberately stops short of the full
weapon/loot system, but every seam here is placed so that system can plug in
later without reworking consumers.

## 1. Goal

When anything takes damage, a number pops out of it, arcs under gravity, and
fades. Critical hits deal multiplied damage and additionally show a flavour
word ("POW!", "BLAM!") in a distinct font. Fonts, colors, and motion are
configurable; flavour words are authored content, keyed per weapon class. The
underlying damage model is restructured so that future weapons, gear, and
modifiers (Borderlands-style loot) extend it by adding data, not by editing
consumers.

## 2. Where we are today

- `game/events.ts` — `DamageEvent { target, amount }`. Emitted by
  `arrow-system.ts` and `damage-trigger-system.ts`.
- `game/health/health-system.ts` — reads `DamageEvent`, applies `amount`,
  emits `DeathEvent` at zero. Knows nothing about crits. Stays that way.
- Damage is a bare `damage: number` duplicated on `BowComponent`,
  `ArrowComponent`, and `DamageTriggerComponent`. No crit anywhere.
- `game/combat/damage-shake-system.ts` — trauma `+= amount * 0.03` per hit.
- `engine/text/` — `FontSettings` is a serializable value type with editor
  file-picker (see `InteractableComponent.font`); `renderer.drawText` supports
  `color` (RGBA, so alpha fades work) and `outline`, but **not scale or
  rotation** (see §9.1).
- ~40 pixel fonts under `game/content/assets/*.font.zip`.
- No seeded RNG; `Math.random()` used ad hoc (`bow-system.ts` shot spread).

## 3. Locked decisions

1. **Three-stage damage model: stats → resolution → outcome.** A weapon _is_ a
   stat block; one pure function rolls the hit; the event carries the resolved
   result. No consumer ever re-rolls or re-multiplies.
2. **Crit is mechanically real, resolved at the source.** The multiplied
   amount is what lands in the event; `crit: boolean` is derived metadata that
   consumers (hitsplats, shake, later audio/particles/on-crit mechanics) read.
   It is not architecturally cosmetic — today's consumers just happen to be.
3. **Events carry resolved facts, not live references to resolve later.**
   `DamageEvent` includes `crit` and `flavourSet` directly because the source
   entity (an arrow) may despawn; `source: EntityId` is included as best-effort
   context (knockback, attribution), never as something consumers must
   dereference for correctness.
4. **Rolls happen at the hit, not at fire time.** The system that emits
   `DamageEvent` calls the resolver. Universal rule across arrow, trigger, and
   future melee/AoE. (Modifier snapshotting nuance: §10.2.)
5. **Hitsplats are ECS entities** in a new `game/hitsplat/` slice — spawn
   system, update system, render system — not a private array in a renderer.
   Behavior in systems, and other systems can react to them later.
6. **Presentation is configuration, content is authored.** Look/motion tuning
   lives in a serializable style component (editor-tweakable); flavour words
   live in JSON under `game/content/hitsplats/`, keyed by string.

## 4. The pipeline

```
[DamageStatsComponent] --> resolveHit(stats, modifiers, rng) --> DamageEvent{amount, crit, flavourSet, source}
   ^ per weapon/hazard        ^ one pure function                    |
                                                    +----------------+----------------+
                                                    v                v                v
                                              HealthSystem    HitsplatSpawn    DamageShake
                                              (amount only)   (all fields)     (amount+crit)
```

## 5. Data model

### 5.1 `DamageStatsComponent` (game/combat/)

Replaces the bare `damage: number` on bow/arrow/trigger. Serializable, so
prefabs and the editor can author it.

```ts
@serializable("DamageStats")
class DamageStatsComponent {
	@serialize() base: number; // pre-crit damage
	@serialize() critChance: number; // 0..1
	@serialize() critMultiplier: number;
	@serialize() flavourSet: string; // key into flavour content, e.g. "arrow"
}
```

The three stat fields are flat on the component (house style for combat
components) and structurally satisfy the `DamageStats` type in §5.2 — no
nested value type. This is the seed of the loot system: generated weapons are
differently-filled instances of this (and future sibling stat components —
elemental, fire rate — follow the same pattern). Hazards (spike triggers)
hold one too, typically with `critChance: 0` (§10.5).

### 5.2 `DamageStats` and `resolveHit` (game/combat/resolve-hit.ts)

The stat trio travels together everywhere (component → projectile →
resolver), so it's one plain shape rather than loose fields:

```ts
type DamageStats = { base: number; critChance: number; critMultiplier: number };

type HitModifiers = { critChanceBonus: number; critMultiplierBonus: number; damageScale: number };

// The only place crit math exists; clamps effective chance to [0,1] internally.
resolveHit(stats: DamageStats, mods: HitModifiers, rng: () => number): { amount: number; crit: boolean }
```

`DamageStats` is a **structural type**, not a class: `DamageStatsComponent`
keeps its three stats as flat serialized fields (§5.1) and satisfies the
shape directly, as does a fired arrow carrying its own copied trio (§10.2) —
both pass straight into `resolveHit`. `mods` is the additive aggregation of the
attacker's modifier components (§10.3); until modifiers exist, callers pass a
zero-value default. `rng` defaults to `Math.random` (§10.7).

### 5.3 `DamageEvent` (extended)

```ts
class DamageEvent {
	target: EntityId;
	amount: number; // resolved, post-crit
	crit: boolean;
	flavourSet: string; // presentation key, frozen at hit time
	source: EntityId | null;
}
```

`HealthSystem` continues to read only `target` + `amount` — zero changes to
its logic.

## 6. The hitsplat slice (`game/hitsplat/`)

### 6.1 `hitsplat-component.ts`

```ts
class HitsplatComponent {
	text: string; // the number, pre-formatted
	flavour: string | null; // crit word, resolved at spawn
	crit: boolean;
	incoming: boolean; // target was the player (styling, §10.8)
	velocity: Vector2;
	age: Seconds;
	lifetime: Seconds;
}
```

Position lives in the entity's `TransformComponent` like everything else.

### 6.2 `hitsplat-spawn-system.ts` (update)

Reads `DamageEvent`. Per event: spawn an entity at the target's top (sprite
half-height, like `interact-hint-render-system.ts`), launch velocity sampled
from the style config (angle range biased _away_ from `source`'s x when
available, so splats knock out of the target), resolve `flavourSet` → a random
word from the flavour content (crits only), longer lifetime + stronger launch
for crits. Only spawns for targets with a `HealthComponent` (mirrors
`DamageShakeSystem`'s filter).

### 6.3 `hitsplat-system.ts` (update)

Ballistics + lifetime: `velocity.y += gravity * dt`, integrate position,
`age += dt`, destroy at `lifetime`.

### 6.4 `hitsplat-render-system.ts` (render)

Draws the number with the normal `FontSettings` + fill/outline colors from
style config; crits use the crit `FontSettings` and crit color, with the
flavour word drawn above the number. Alpha on both fill _and_ outline ramps to
0 over the last `fadePortion` of lifetime (fading only the fill leaves a
ghost outline). Crit pop animation: see open question §10.1 — renderer
capability decides the approach.

## 7. Style configuration — `HitsplatStyleComponent`

Serializable component on a singleton entity (spawned by
`scenes/platformer.ts`), so every knob is editor-tweakable — juice tuning is
iteration-speed-bound, this matters.

| Field                                      | Meaning                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| `font: FontSettings`                       | normal hit number                                           |
| `critFont: FontSettings`                   | crit number + flavour word (the chunky one)                 |
| `color`, `outlineColor`                    | normal fill/outline                                         |
| `critColor`                                | crit fill                                                   |
| `incomingColor`                            | player-taken damage fill (§10.8)                            |
| `launchSpeedMin/Max`, `launchAngleMin/Max` | initial pop-out velocity sampling                           |
| `gravity`                                  | px/s² downward                                              |
| `lifetime`, `critLifetimeBonus`            | seconds                                                     |
| `fadePortion`                              | last fraction of lifetime spent fading (≈0.4)               |
| `popScale`, `popDuration`                  | crit pop: spawn scale (≈1.6×) and snap-down time (§9.1)     |
| `flavourTilt`                              | max random rotation of the flavour word (±radians)          |
| `blockedText`                              | word shown for zero-damage hits (§10.10), default "BLOCKED" |

Font candidates: normal = `kapel` / `fivebyfive`; crit = `doublehomicide` /
`kiwisoda` / `unbalanced_2`.

## 8. Flavour content & shake

### 8.1 Flavour words — `game/content/hitsplats/flavour.json`

```json
{
	"default": ["BLAM!", "POW!"],
	"arrow": ["THWACK!", "SKEWERED!"],
	"blunt": ["WHAM!", "CRUNCH!"]
}
```

Lookup: `flavourSet` key, falling back to `"default"`. Per-class by default; a
unique legendary weapon just gets its own key. Content keys, not code.

### 8.2 Shake rebalance — `damage-shake-system.ts`

`TRAUMA_PER_HP` drops (normal hits get subtler than today's 0.03) and crits
add a **flat** `critTraumaBonus`. Flat, not a multiplier: crit damage is
already multiplied into `amount`, so a multiplier would double-count and big
crits would get nauseating. Both knobs move into `HitsplatStyleComponent` (or
a sibling shake config) so they're tunable alongside the visuals.

## 9. Engine work required

### 9.1 Text scale/rotation — DECIDED: transform glyph quads (+ text-path cleanup)

Investigated. Glyphs are already drawn as arbitrary-corner quads:
`FontAtlas.layout()` produces per-glyph `GlyphQuad`s and `drawText` pushes
each through `pushQuadShape(px[], py[], uv, color)`. The image path
(`imageQuad`) already rotates its corners via a `rotateCorners` helper before
pushing. So scale/rotation for text is the same move: transform each glyph
quad's corners around the text anchor `(x, y)` — scale, then rotate — before
pushing. **No texture blitting, no caching, no shader work.**

Plan:

- Extend `DrawTextOpts` with `scale?: number` and `rotation?: number`
  (radians, about the anchor point).
- Outline offsets are applied in _local_ (pre-transform) space so the outline
  scales and rotates with the text instead of staying axis-aligned.
- **Cleanup while in there** (the text path was bolted on and shows it):
  `drawText` inlines the quad-push loop twice (outline pass + fill pass) and
  `drawGlyph` a third time. Factor one shared
  layout → transform → push helper; the three call sites become thin.
- Engine-layer work; knows nothing about hitsplats.

This unblocks the crit pop (spawn at ~1.6× scale, snap to 1× over a few
frames) and the tilted flavour word (±10°). Style config gains `popScale`,
`popDuration`, `flavourTilt`.

## 10. Design decisions

Originally the open-questions list; every item has since been decided with
the author (2026-07-05). Kept as numbered entries so systems built on this
plan can cite them (e.g. "§10.2").

### 10.1 Crit pop animation mechanism — RESOLVED

See §9.1: transform glyph quad corners in `drawText`, plus text-path cleanup.

### 10.2 Modifier snapshotting for projectiles — DECIDED: snapshot at fire

Rolls happen at impact (locked, §3.4), but the _inputs_ to the roll are
snapshotted at fire time: the bow copies its `DamageStatsComponent` values
**and** the owner's aggregated `HitModifiers` onto the arrow when it spawns.
The arrow is self-contained — deterministic in flight, survives owner
despawn; a buff expiring mid-flight does not retroactively weaken an arrow
already loosed. This extends the existing pattern — `ArrowComponent.damage`
is already a fire-time copy of `BowComponent.damage` today.

### 10.3 Modifier aggregation semantics — DECIDED: percentage-point additive

Crit-chance modifiers stack additively in percentage points
(_procentpunten_): `+10%` and `+15%` yield `+25` percentage points, i.e.
`chance = base + Σ bonuses`. No multiplicative stacking. Crit chance is
**uncapped at the core** — stat blocks and modifiers may sum past 1.0 and we
don't police that anywhere in data. The _roll site_ (`resolveHit`) clamps the
effective chance to `[0, 1]`; above 100% simply means "always crits", no
overflow conversion. Crit-multiplier bonuses stack the same way (flat
additive: `critMultiplier + Σ bonuses`).

### 10.4 Damage typing / event extensibility — DECIDED: extend later

`DamageEvent` stays minimal: `target, amount, crit, flavourSet, source`. No
speculative `tags` field — it's a class we own, adding fields when
elemental/DoT work actually starts is cheap, and speculative slots invite
stringly-typed logic. Standing rule: consumers must _never_ switch on
`flavourSet` as a proxy for damage type; it is presentation-only by contract.

### 10.5 Environmental damage & crits — DECIDED: same stats, critChance 0

Hazards (spike triggers etc.) carry the same `DamageStatsComponent` as
weapons, authored with `critChance: 0` and `flavourSet: "default"`. No
special-casing anywhere in code; a trap that _can_ crit becomes possible
later purely by editing data.

### 10.6 Splat spam policy — DECIDED: separate splats, revisit later

Every hit spawns its own splat; random launch angles spread them naturally.
No merge window, no cap for now. Constraint to honor: all spawning goes
through **one function** in the spawn system, so a per-target merge window
(ARPG-style accumulating number) is a cheap local change if DoT/multi-pellet
hits ever make it noisy.

### 10.7 RNG & determinism — no work needed

`Math.random()` matches current codebase practice (bow spread already uses
it). If replays/determinism ever matter, `resolveHit`'s injected `rng`
parameter is the seam — sources would pass a seeded stream. The seam exists
by construction.

### 10.8 Incoming vs outgoing presentation — DECIDED: full treatment both ways

Damage the player takes gets the complete treatment — arc, fade, crit pop,
and flavour word — just rendered in `incomingColor` (red) instead of the
outgoing colors. Enemies "BLAM!" you back; symmetric and chaotic-fun. The
`incoming` flag on `HitsplatComponent` (§6.1) only selects the color, nothing
else.

### 10.9 Render layer & camera — DECIDED: scale with world

Splats live in world space and zoom with the camera like sprites — chunky
scaled pixels match the pixel-art style and splats stay visually attached to
their target. No screen-constant sizing. The exact `resolveRenderLayer` key
(above sprites, below dialogue/UI overlays) is picked when wiring the scene.

### 10.10 Number formatting & zero damage — DECIDED: integers; "BLOCKED"

Numbers render as rounded integers. A hit resolving to zero damage renders
the word **"BLOCKED"** (style-config field `blockedText`, drawn in the normal
font/colors) instead of a number. All formatting lives in the spawn system's
single formatting function so future changes (large-number abbreviation,
immunity vs block wording) are single-point.

## 11. Build order

1. **Renderer text work** (§9.1) — factor the shared glyph-quad push helper,
   add `scale`/`rotation` to `DrawTextOpts` with local-space outline offsets.
   Pure engine change, verifiable against existing text call sites.
2. **Damage model** — `DamageStatsComponent`, `resolveHit`, extended
   `DamageEvent`; migrate bow/arrow/trigger onto it with the §10.2 fire-time
   snapshot (and its mandatory comment). `bun check` + verify existing damage
   still works. No visuals yet.
3. **Hitsplat slice** — components + three systems + style component +
   flavour JSON; wire into `scenes/platformer.ts`. First-pass fonts/colors.
4. **Shake rebalance** (§8.2) and tuning pass in the running game — launch
   feel, gravity, pop timing, layer choice (§10.9), colors.

Each step lands independently; 2 is a pure refactor with no visible change.
