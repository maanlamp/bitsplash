# VFX System

- **Type:** feature
- **Date:** 2026-07-20
- **Status:** accepted

## Goal

A general particle/VFX system built and validated against five real effects —
blood, falling leaves, loot beams, rain, and fire — plus the unified
time-value primitives (`Timeline`, `Ease`, `Keyframes<T>`, `Tween`) the whole
engine migrates onto. Effects are authored as data, previewable live in the
editor, and structurally incapable of leaking runtime state into scene files
or save blobs.

## Context & problem

The roadmap requires a particle system ("build it once against several real
effects rather than guessing"). The loot plan fakes a rarity beam with an
explicit migrate-later marker; the Act-1 Burning cutscene needs fire VFX; the
audit catalogs ~10 hand-rolled countdown/fade implementations
(`U-P2-countdown`, `U-P2-cameratween`, `U-P1-fade`, `U-P2-fademodels`).

Constraints that bound the solution:

- **Serialization provenance** (AGENTS.md): scene files are produced only by
  journal-replay-onto-scratch; the save tripwires hard-crash on any
  non-journaled edit-world mutation. VFX run-state must therefore be
  _unrepresentable_ in the serializable universe, not filtered out.
- **The hitsplat leak precedent**: an undecorated component beside a
  serializable `TransformComponent` freezes/thaws as an immortal
  transform-only orphan (`hitsplat-spawn-system.ts:86-96`,
  `serialize.ts:49-57`). Conventions regress; structure doesn't.
- **The renderer** (`renderer-2d.ts`) draws layers into premultiplied scratch
  targets composited in order; per-layer blend machinery exists but has zero
  callers. Blend must become a per-draw property, not a layer property.
- **No migrations**: pre-ship, breaking saves/scenes is acceptable. There are
  zero easing strings or Timer components in committed content.
- **Editor authoring**: `editorEdit` runs no gameplay systems today; live
  emitter preview must not touch anything the save tripwires diff.

## Decision

Four pillars:

**1. Animation primitives** (`src/engine/animation/`), replacing the current
easing table, `Tween` internals, and `FadeTimeline`:

- **`Timeline`** — serializable bounded clock value type.
  `elapsed`/`duration` (both `@serialize` — restored animations _resume_,
  fixing the current mid-fade restart glitch), `tick(dt: Seconds)`, `t()`,
  `done()`, `remaining()`, `restart(duration?)`. `elapsed` is settable and a
  signed `rate` slot is reserved (playback forward-compat, below).
  Zero-duration is defined: immediately `done()`, `t() === 1`. **Once-only —
  no looping mode.** Ambient loops are stateless phase sampling (below).
- **`Ease`** — cubic-bezier-only representation: four control floats, an
  immutable `@serializable` value type. Typed frozen preset constants
  (`Ease.Linear`, `Ease.OutCubic`, `Ease.OutBack`, …) — **no strings in
  code**; JSON carries the floats (plus an optional preset label for
  debuggability) and is hard-error validated at load. Presets use exact
  derived control points where representable (linear, in/out cubic, the
  backs); `InOut*` variants are documented CSS-style approximations.
  Elastic/bounce are multi-key preset _curves_, not eases. Eval solves
  x(t)=phase (LUT-seeded Newton — exact). Assignment copies; `retarget`
  replaces, never mutates (the current `easing.set()` mutate-in-place idiom
  dies with it — a shared frozen preset must never be written through).
- **`Keyframes<T>`** — stateless keyframed track: `sample(t)` (unclamped —
  overshoot eases are load-bearing), keys with per-segment `Ease`,
  interpolation as a per-type strategy. Serialization via concrete registered
  subtypes (`KeyframesNumber`, `KeyframesColor`) since functions don't
  round-trip. Color lerps in sRGB now; the space is swappable inside the
  color interpolator without touching data. Tracks are shared def-data:
  per-particle state is an age scalar, never a track instance.
- **`Tween`** — kept as the runtime-target front door (prior art: Godot
  Tween, CSS transitions, Flutter): a thin `@serializable` composite of
  `Timeline` + 2-key `Keyframes`, preserving `from/to/duration/ease`
  construction and `retarget()` (reconstruct keys + `restart`). Because its
  Timeline serializes `elapsed`, a mid-fade save now resumes — a deliberate
  behavior change pinned by a new SequenceFixture test.
- **`EffectHandle`** stays unchanged as the lifecycle/identity layer.
- **Deleted:** `FadeTimeline`, the named-easing table + `Easing` value type,
  Tween's parallel implementation.
- **Oscillators are not a type.** Beam pulse, mote shimmer, wind gusts =
  `curve.sample(phase(ambientTime))`, where `ambientTime` comes from the
  shared ambient clock (`engine/weather/ambient-clock.ts`, created by the
  weather plan): an accumulated seconds counter stepped in `ambientSystems()`
  (freezes under pause — user decision: pause is a true still;
  `Clock.elapsed` advances during pause and must not be used). VFX and
  weather read the same clock, so eye and ear stay coherent by construction.
  Gust noise is continuous hash-noise of unbounded time — no wrap, no pop.
- **Time-base table** (documented in code, enforced by the cleanup): new
  primitives tick in **seconds**; VFX systems consume **scaled** `time.dt`;
  migrated call sites keep their current base with an explicit conversion at
  the boundary (the ms/seconds + scaled/unscaled schism becomes visible,
  documented per consumer, and unchanged in behavior while `scale ≡ 1`).

**2. VFX core** (`src/engine/vfx/`) — the inverted storage model:

- **`EmitterComponent` = pure authored config.** 100% `@serialize` fields
  (def reference, render `(layer, order)`, sim space local/world, rate/burst
  params, enabled). Read-only to all systems, enforced by dev-build
  `Object.freeze` — a stray write would otherwise brick saving via the
  tripwire. Authored on scene entities (leaf/fire emitters on trees) or added
  to runtime entities (loot-corpse beam).
- **All run-state lives in stores owned by the VFX system instance** —
  SoA particle pools (typed arrays), spawn accumulators, decal buffers —
  keyed by entity id. Not components, not entities: structurally invisible to
  `serializeWorld`, the journal, and the tripwires. Rules that make this
  hold: the store is an **instance field** (never module-level — edit and
  run worlds share entity ids); eviction tests **entity ∧ component**
  presence (inspector component-removal must evict) plus `ecs.onDestroy`
  hooks (`onDestroy` is a bare last-writer-wins `Map.set` — the registration
  site guards the exclusivity with a dev-build assertion that no hook for
  `EmitterComponent` exists yet);
  **config is re-read every frame, nothing derived is cached** (the ECS
  emits no field events; re-reading is the only structurally safe change
  detection — this also makes def hot-reload and undo/redo free).
- **Transient effects are not entities.** `spawnBurst(def, pos, dir)` /
  `spawnAttached(entityId, def)` write directly into the store; decals are a
  capped ring buffer (recycle oldest). Entities exist only for authored
  emitters and attachment hosts. The `fired` flag does not exist; one-shot
  effects are fire-and-forget calls. (Consequence, documented: an _authored_
  one-shot emitter is unrepresentable content — every one-shot has a runtime
  trigger.)
- **Snapshot semantics, uniform and structural:** all VFX run-state drops on
  freeze/save; emitters re-derive from config + host entities on thaw.
  Continuous emitters **seed-by-age** on (re)create (spawn the steady-state
  population with randomized ages — free); only colliding defs may use a
  capped stepped pre-warm. This is the codebase's first intentionally
  non-restorable runtime state: documented here **and as an AGENTS.md
  doctrine note** so nobody later "fixes" it by serializing pools.
- **Host death = live-out** (user decision): emission stops the frame the
  host dies; in-flight particles finish their lifetime; beams fade over a
  short out-envelope. Attached decals clear on `DeathEvent` (respawn _reuses_
  entity ids — a dangling reference would teleport smears onto the
  respawned enemy).
- **System placement:** one `VFXUpdateSystem` in the weather plan's new
  `ambientSystems()` category. `game` spreads that category after
  `gameplaySystems`, so VFX still steps after `CameraShakeSystem` —
  DamageEvents survive until the end-of-frame clear, and camera-tracked
  emitters read the current-frame pose. `editorEdit` spreads the same
  category for edit preview — never `editWorldSystems`, which the `game`
  composition also spreads (`compositions.ts:180`): that would double-step
  VFX in the shipped game _and_ at the wrong position. A
  `createVfxSystems()` factory returns the update/render pair sharing one
  store instance; each composition calls it once and places the members into
  its update/render lists (extending the decorations sharing pattern,
  `compositions.ts:146-161`, across the two lists).
- **Editor live preview** (user decision: crucial): the edit world steps VFX
  via the existing focused-view tick (`app.tsx:779-784` → `SceneView.update`)
  — reading frozen configs, writing only the store, so the tripwires cannot
  fire _by construction_. dt is clamped in VFX stepping (raw rAF gaps would
  burst-dump spawn accumulators). Preview is focused-view-only (that is what
  the editor ticks; acceptable — you watch what you edit).

**3. Renderer** (`src/engine/render/`):

- **Rip out per-layer blend** (user decision): `setLayerBlend`,
  `applyCompositeBlend`, the `BlendMode` composite path, and
  `LayerState.blend/opacity` all die (verified zero callers; the sprite
  editor's blend UI is disjoint Canvas2D machinery). The composite hardcodes
  premultiplied-normal.
- **Add per-draw blend**: quad draws accept `blend: "normal" | "additive"`.
  Additive fill is `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)`
  — add color, accumulate coverage the same way normal fill does. **Corrected
  during implementation:** this section previously specified
  `(SRC_ALPHA, ONE, ZERO, ONE)` on the premise of a premultiplied scratch, but
  the scratch is fed by straight-alpha textures
  (`UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`, `renderer-2d.ts:572-573`) and the
  normal fill path is `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE,
ONE_MINUS_SRC_ALPHA)`. The `ZERO, ONE` alpha pair would have pinned scratch
  coverage and broken the composite. The straight-alpha upload is a load-bearing
  invariant and is documented as such at the texture-creation site. The blend
  flag joins the batch-merge key at **both** merge sites (`recordQuad` and
  `drawTile`'s inline merge), so interleaved modes split into separate
  `drawArrays` calls while preserving submission order — which is what gives
  correct occlusion in both draw orders.
- **Public textured-corner quad API** (thin wrapper over the private
  `pushQuadShape`) for velocity-stretched particles and beam geometry.
- **No new render layers, no layer migration.** Effects draw into existing
  authored bands via `(layer, order)` config; each effect family shares few
  order values (every distinct `(layer, order)` id owns a full-viewport
  scratch target).
- RGBA8 clamping bounds additive stacking at 1.0 — accepted; "over the top"
  comes from shape, motion, and scale, not HDR.

**4. Wind seam** (weather owns the provider; this plan defines only how a
consumer listens):

- `sampleWind(ecs, x, t)` is the seam — a plain engine function with a
  **position-aware signature whose `x` is reserved** (v1 ignores it). It is
  **weather-backed**, living at `engine/weather/sample-wind.ts` and derived
  from effective weather. (The weather core has since shipped, so this seam is
  live rather than a calm stub; `engine/weather/effective-weather.ts` is the
  source of truth for what it returns.)
- There is **no `WindComponent`** and no registry key for signal behavior.
  Both were dropped by user ruling: weather is engine-owned, so a
  registry-key indirection would only smuggle behavior across the layer
  boundary. Wind parameters are authored weather data, not a scene singleton.
- **Amended consumer contract.** "Leaves and rain never change" does not
  survive weather. Three named hooks in the effect layer are weather-aware by
  design: rain's kill predicate tests the **rain-blocking classification**
  rather than raw solidity; rain spawn/cull consults `rainHeightAt`; and
  emitter defs carry a **weather-scaling** field whose factor the VFX update
  re-reads per frame (defs themselves stay frozen config). Nothing else about
  a consumer changes.

### Events

`DamageEvent` grows `hitPoint: Vector2 | null`, coexisting with the existing
`origin` (which stays untouched — it is the _stimulus position_ consumed by
perception, deliberately bearing-offset for arrows). `hitPoint` is the
precise impact point, consumed only by VFX: arrows pass the raycast's
`hit.point` (available at the emit site, currently unused for this), melee
and `DamageTrigger` pass null. Blood falls back `hitPoint ?? ` a
target-center burst directed away from `origin`/`source`.

### The five effects (game layer: `src/game/vfx/` + defs under `src/game/content/vfx/`)

Effect defs are JSON (hot-reloaded via Vite, hard-error validated at load).

- **Blood** — one-shot world-space burst off `DamageEvent` (melee + arrow),
  direction from `hitPoint`/`origin`; gravity-arced; each moving particle
  raycasts its move segment (predicate: terrain + dynamic bodies,
  `!body.isSensor`; toi=0 degenerate hits skip the smear). On hit: die +
  oriented smear decal — world-static on terrain, host-attached (body-space
  offset; accepted: no mirror on flip) on dynamic bodies.
- **Leaves** — continuous authored emitters on tree entities; wind-advected
  drift/sway/rotation; per-leaf pre-rolled pass-through-vs-rest; collision =
  cached merged solid-cell set keyed on Σ `TileGrid.version` (never raycast);
  rested leaves become short-lived ground marks.
- **Loot beam** — `spawnLootBeam(entity, visualClass)` seam where
  `visualClass = Common | Uncommon | Rare | Epic | Unique` (the loot plan
  defines Unique as the loudest class — a 4-tier param would cap the ceiling
  wrong). Composite def: pulsing main beam (phase-sampled curve), motes,
  Epic adds an orbiting helix of secondary beams, Unique out-shouts Epic.
  Additive quads + particle motes, local-space, validated via a debug
  trigger. The loot plan is amended to call this seam (see Deliverables).
- **Rain** — camera-tracking spawn band above the viewport; velocity-
  stretched stripe quads (textured-corner API); wind-slanted; splash
  micro-burst + brief ground mark on kill; pre-warms on camera cuts and
  restore. The three weather hooks of the amended contract apply: the kill
  predicate tests the rain-blocking classification, spawn/cull consults
  `rainHeightAt` so rain stops under overhangs, and emission scales with
  effective precipitation. Scheduling belongs to the weather plan.
- **Fire** — flipbook-frame particles (def carries frame metadata:
  width/count/fps; the renderer already samples source rects — no renderer
  work), color-over-life ramp into additive glow, smoke wisps. Debug-
  triggered now; its real consumer is the Act-1 Burning cutscene.

### Playback forward-compat (absorbs the former plan-2 brief)

Locked here so the future effect/curve editor can build without reworking
primitives: `Timeline.elapsed` is settable and a signed `rate` slot is
reserved — that is the entire scrubbing contract for _curves_. The boundary
is stated: keyframed values scrub; the particle sim is event-driven and
stateful and **re-simulates** (preview = run from t=0), it does not scrub.
The future editor builds on `engine/sequence`'s `SequenceRunState` (audit
warning: do not fork a second run-state representation) and must reconcile
the name "Timeline" with the existing editor `<Timeline>` clip widget
(`src/editor/timeline/`, currently audio-only).

## Alternatives considered

- **One entity per particle** — rejected: `ecs.query` is a full scan; 600
  rain entities tax every system, and mixed-serializability entities are the
  orphan-ghost factory this design exists to kill.
- **Per-layer additive blend (fill + composite)** — rejected after critique:
  correct only when fill and composite flags stay coherent, empty-layer
  pinning and idle-dispose NORMAL-revert are permanent operational hazards,
  and no single layer position serves leaves, rain, and decals. Per-draw
  blend is strictly better and deletes machinery instead of adding it.
- **Named-function easings (status quo)** — rejected by the user: stringly
  typed, and the future curve editor would force a second representation to
  coexist forever. Bezier-only with typed presets is the unified form.
- **Deleting Tween** — rejected: prior art (Godot/CSS/Flutter/DOTween-void)
  converges on keeping a 2-point runtime-target front door; both existing
  consumers are runtime-targeted (fade from _current_ alpha, mid-flight
  slide reversal) and cannot be authored data even in principle.
- **A looping mode on Timeline (oscillator subsumption)** — rejected after
  critique: every real oscillator here is stateless phase off a time source;
  ticked loop state adds serialization churn, loses free phase sync, and
  looped noise pops at the wrap.
- **Serializing particle pools** — rejected: save-bloat for cosmetic state;
  seed-by-age on thaw is visually equivalent. Documented as a deliberate
  doctrine exception instead.
- **Mixed config/run-state emitter component (`fired` flag + undecorated
  pool)** — rejected: discipline-based, and editor preview would trip the
  save tripwires. The inverted storage model makes the illegal states
  unrepresentable.
- **Runtime layered-sprite ingestion + rustle, procedural wind audio, weather
  states** — parked to the weather plan and the sprite-editor design session.
  This plan ships only the consumer side of the wind seam.

## Approach / steps

Workstreams. A and B are independent; C needs both; blood lands first to
stabilize the def schema; the remaining effects then parallelize; cleanup is
a separate later session.

### WS-A — Animation primitives (`engine/animation/`)

1. `timeline.ts` — `Timeline` value type (`@serializable("Timeline")`;
   the name is free — `FadeTimeline` dies this plan and `TimerComponent`
   registers as `"Timer"`). Unit tests: tick/done/restart/zero-duration/
   serialization round-trip with elapsed.
2. `ease.ts` — `Ease` value type + frozen preset table (derived exact control
   points; documented approximations for `InOut*`), LUT-seeded Newton solve.
   Unit tests: preset exactness vs closed-form easings, solve precision,
   immutability (presets frozen).
3. `keyframes.ts` — `Keyframes<T>` + `KeyframesNumber`/`KeyframesColor`
   registered subtypes; unclamped sampling; per-segment ease. Unit tests
   incl. serialization.
4. `tween.ts` — rewrite `Tween` as the Timeline+Keyframes composite. Its
   constructor and `retarget` now take `Ease` (not strings), which forces the
   boundary conversions in this step: `startFade`'s signature takes an `Ease`
   (`screen-fade-system.ts`), dialogue slide passes presets directly, and the
   sequence fade op keeps its _authored_ `easing?: string` param but maps
   string→preset at the boundary via a small shim owned by the op (its
   authored-param final form is settled in cleanup). `tick(ms)` call sites
   convert to seconds explicitly. Update `test/camera-serialization.test.ts`;
   **new SequenceFixture test: save mid-fade → restore → fade resumes from
   saved alpha** (pins the deliberate behavior change).
5. Delete `fade-timeline.ts`; migrate its three call sites — the two
   undecorated notice components _and_ `hud-dyn-system.ts`'s
   `fade.alpha()` consumption — to `Timeline` + `Keyframes` directly (the
   full notice unification stays in cleanup).
6. Delete the `Easing` value type together with its editor surface
   (`easing-select.tsx` + the `register-renderers.tsx` entry) — after step 4
   nothing holds an `Easing` (it lived only inside `Tween`). The named
   easing _functions_ survive as a deprecated internal module for the one
   remaining direct consumer (camera transition's hand-rolled glide, string
   field + `ease()` lookup) until cleanup migrates it; delete the module in
   WS-I.

### WS-B — Renderer (`engine/render/`)

7. Rip-out: `setLayerBlend`, `applyCompositeBlend`, `BlendMode`,
   `LayerState.blend/opacity`; hardcode the premultiplied-normal composite at
   **all three** call sites — the layer loop (`renderer-2d.ts:1444-1448`) and
   the present pass (`:1826`, `:1833`).
8. **Done.** Per-draw blend flag on quad commands;
   `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)` (corrected —
   see the per-draw-blend bullet above) applied per batch in `runCommand`;
   blend joins the merge key in `recordQuad` **and** `drawTile`'s inline merge;
   the straight-alpha upload invariant documented where textures are created.
   Shipped as `QuadBlend` + `applyQuadBlend` (`render/blend.ts`), which replaced
   `applyLayerBlend`; step 7's per-layer rip-out was deliberately left undone.
9. **Done.** Public textured-corner quad API `drawCornerQuad(id, opts)` (wraps
   `pushQuadShape`); omitting `image` draws a solid tint through `whiteTex` on
   one shared merge key. Also shipped alongside: `shear` on `DrawImageOpts`
   (top-two-corner displacement, for foliage sway) and
   `quantizeToTexel(value, zoom)` (`render/quantize.ts`).
10. Visual validation per AGENTS.md: temporary logging + `bun run dev`,
    additive over/under normal sprites in one band, then remove logs. (Blend
    math is not headlessly assertable in this stack; the derivation is in
    this plan's research notes.)

### WS-C — VFX core (`engine/vfx/`) — needs A + B

11. Def schema + loader (JSON, hard-error validation, hot-reload). A def is a
    **list of parts**: particle-emitter parts and ~~beam-quad parts~~ **ribbon
    parts** (composite effects — the loot beam's main beam + motes + Epic helix,
    fire's flames + smoke — are one def with several parts). Emitter parts: emission
    (rate/burst), spawn shape (`point | box | camera-band`), lifetime
    `{min,max}`, velocity/gravity/drag, initial rotation + spin,
    velocity-stretch factor, over-life tracks (scale/alpha/color/rotation as
    `Keyframes`), flipbook frame metadata (width/count/fps), blend,
    `(layer, order)`, sim space, wind influence factor, collision mode
    (`none | tiles | raycast`) with response (`die | rest | passThrough` +
    per-particle rest probability), decal spec, on-death sub-effect
    reference (rain splash).

    **Amended 2026-08-02** (`docs/plans/2026-08-02-feature-weather-expansion.md`):
    beam-quad parts are replaced by a single `kind: "ribbon"` whose **path generator**
    is the only thing that varies — vertical for the loot beam, helical for the Epic
    helix, midpoint-displacement for a lightning bolt, wandering noise for a wind
    line. The rest of the spec is unchanged: width profile (was length/width),
    phase-sampled pulse curve, blend, tracks. One kind rather than two, because a beam
    and a bolt differ only in their path — the same consolidation Niagara made, whose
    docs state that "beams are simply ribbons with specific logic, as a separate beams
    renderer doesn't exist".

12. `emitter-component.ts` — pure config, dev-build frozen;
    `vfx-store.ts` — instance-owned SoA pools + decal ring buffer + spawn
    accumulators, keyed by entity id; eviction (entity ∧ component, plus
    `ecs.onDestroy`). The time base is the shared ambient clock
    (`engine/weather/ambient-clock.ts`), not a VFX-owned `vfxTime`.
13. `vfx-update-system.ts` — spawn/advect/collide/age; per-frame config
    re-read; dt clamp; seed-by-age on emitter (re)appearance; host-death
    live-out. Registered in `ambientSystems()` (the weather plan's new
    composition category), which `game` spreads after `gameplaySystems` — so
    VFX still steps after `CameraShakeSystem`, before the end-of-frame event
    clear — and which `editorEdit` spreads for edit preview. **Never
    `editWorldSystems`**, which `game` also spreads: that would double-step
    VFX in the shipped game and at the wrong position.
    `@profiler("VFX", …)` labels.
14. `vfx-render-system.ts` — pools/decals/beams via `(layer, order)`;
    additive flag per draw; shares the store instance via factory wiring in
    `compositions.ts`.
15. Consume `sampleWind(ecs, x, t)` from `engine/weather/sample-wind.ts` — no
    component, no registry key (pillar 4). Gust = continuous hash-noise of
    the unbounded ambient clock, owned by the weather slice.
16. Harness test (SequenceFixture): boot ECS + VFX systems, author an
    emitter, run N frames, `capture → restore → continue`; assert the
    snapshot contains **zero** VFX run-state and no orphan entities; assert
    the emitter re-seeds on thaw. This is the structural-guarantee tripwire.
17. AGENTS.md doctrine note: VFX run-state is intentionally non-restorable
    (the one documented exception to "snapshots resume everything").

### WS-D — Blood (first effect; stabilizes schema + events)

18. `DamageEvent.hitPoint`; arrow emit site passes `hit.point`; melee passes
    `origin`; DamageTrigger passes null.
19. `blood` def + spawn wiring off `DamageEvent`; segment raycasts
    (`!isSensor`, toi=0 skip); smear decals world-static + host-attached;
    attached decals cleared on `DeathEvent`.
20. Cached merged solid-cell set utility keyed on Σ `TileGrid.version` (used
    by leaves/rain too).

### WS-E/F/G/H — Leaves, Beam, Rain, Fire (parallel after D)

21. **Leaves**: def + authored emitters on tree entities; wind advection;
    rest/pass-through rolls; ground marks.
22. **Beam**: `spawnLootBeam(entity, visualClass)`; five visual classes with
    escalating composite defs (pulse curve, motes, Epic helix, Unique
    loudest); debug trigger (console/keybind).
23. **Rain**: camera-band emitter (current-frame camera — placement per
    step 13); stretched stripes; splash micro-bursts + ground marks;
    cut/restore pre-warm; the three weather hooks (rain-blocking kill
    predicate, `rainHeightAt` spawn/cull, precipitation-scaled emission).
24. **Fire**: flipbook def + color ramp + smoke; debug trigger.
25. Each effect: tune via JSON hot-reload in `bun run dev`; state in the
    summary what was run and observed (AGENTS.md visual-validation rule).

### WS-I — Cleanup (separate session, after WS-A; serial over its files)

26. Migrate onto the primitives, keeping each site's current time base with
    explicit boundary conversions: camera-transition glide
    (`U-P2-cameratween`) and its `easing: string` → `Ease` (+ register an
    `Ease` inspector renderer — preset picker + floats — replacing the dead
    `EasingSelect`); sequence fade-op easing param; dialogue slide (already
    Tween — verify post-rewrite); hitsplat age **+ the orphan fix** (position
    moves into the component, `TransformComponent` dropped at spawn); arrow
    `stuckRemaining` (+ fix its missing `!isSensor` filter); health-bar
    countdown half only (`fadeAlpha` folds into `remaining()`-based helper;
    the displayed-HP damp chase stays — that's `U-P2-damp`, not a clock);
    wander (`restart(randomDuration)`); dash timers; dialogue pause;
    `TimerComponent` internals embed a `Timeline` (name and registration
    unchanged).
27. Absorb `U-P1-fade-a`: one `NoticeComponent` + one lifecycle system
    replaces the twin death/quest notice systems (the _queue_, `U-P1-fade-b`,
    stays out — genuinely new system).
28. This workstream consciously overrides the audit's "keep Tween and
    FadeTimeline separate / do not merge" steer — the user chose unification
    with Tween surviving as a composite; the audit's underlying concern
    (different envelopes) is answered by `Keyframes` expressing any envelope.
    **Sequencing note:** touches `arrow-*`/`events.ts`, which the loot plan's
    Phase 1 also threads damage types through — do not run both
    implementation sessions concurrently.

### Deliverables alongside this file

- `docs/roadmap.md`: particle-system note replaced per pickup discipline;
  new **weather system** point (with breadcrumbs: wind provider seam in this
  plan; Farnell filtered-noise recipe for wind audio, blocked on audio buses
  `M-P1-7`; mask-driven pixel-perfect rustle interim; spatial wind fields
  only when a scene demands them); new **sprite-editor design session**
  point (layered authoring, owned im/export semantics, pop-out-window as a
  core mechanic; `.pdn` runtime parsing is a verified dead end, Aseprite CLI
  build-time export is the fallback pattern).
- `docs/plans/2026-07-19-feature-loot-and-inventory.md`: Phase 1 step 8 and
  Phase 3 "beam juice" amended to call `spawnLootBeam` with a visual class
  (fake-beam wording + migrate-later marker removed); Collection section
  updated likewise.

## Research findings that drove this

- **Prior art consensus** (Godot/Unity/Pixi/LÖVE + post-mortems):
  emitter-is-the-entity with pooled buffers, never entity-per-particle;
  authored def split from live state; over-life keyframed tracks; don't
  serialize live particles. Godot/CSS/Flutter all keep a 2-point tween front
  door beside keyframes — removal just outsources it (Unity/DOTween).
- **Bevy/Unreal naming**: the pollable bounded clock is Unreal's `FTimeline`
  one-for-one (bounded, ticked, drives curves); stdlib "Timer" means
  delayed-callback — which is exactly `TimerComponent`, already correctly
  named.
- **Blend derivation** — the original derivation assumed a premultiplied
  scratch and concluded additive `(SRC_ALPHA, ONE, ZERO, ONE)`. That premise was
  **wrong and was corrected during implementation**: textures upload
  straight-alpha (`UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`) and the scratch's
  normal fill is `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`,
  so additive is `(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)` — the alpha pair
  must keep accumulating coverage, not pin it. Order-correct occlusion comes
  from blend joining the batch-merge key (submission order preserved), not from
  the blend factors. Per-layer blend machinery had zero callers and two
  operational hazards (idle-dispose blend revert; empty-layer scratch pinning);
  ripping it out was deferred out of this implementation's scope.
- **Codebase structure facts**: event bus clears end-of-frame (late systems
  still see same-frame events); respawn reuses entity ids; compositions
  construct fresh system instances per world; the editor ticks only the
  focused view; `ecs` emits no field-mutation events (`pick-index.ts:19-26`
  documents it); `isSolidCell` queries per call, `TileGrid.version` enables
  synchronous caching; `Clock.elapsed` advances during pause.
- **Dead ends verified**: `.pdn` has no non-.NET parser (BinaryFormatter
  payload); runtime `.aseprite` parsing loses to build-time CLI export on
  maintenance, blend modes, and industry precedent. Both parked with the
  weather/sprite-editor roadmap points.
- **Audit cross-check**: `U-P2-countdown` sites verified (plus several the
  audit missed); `TimerComponent` verified unit-correct (`time.dt` is
  seconds); the audit's "hitsplat orphan" class reproduced and closed
  structurally by this design.

## Risks & open questions

- **RGBA8 additive ceiling** (accepted): stacking clamps at white; epic/
  unique beams get their punch from geometry and motion. If it ever reads
  flat, HDR scratch targets are a contained follow-up.
- **Def schema churn**: blood-first ordering mitigates but won't eliminate
  schema changes from later effects; the schema lands with fire's flipbook
  and rain's stretch fields specified from day one even though blood ignores
  them.
- **Editor preview is focused-view-only** and frozen during runs — accepted
  as the editor's existing tick model; revisit only if authoring pain shows.
- **Pre-warm honesty**: seed-by-age can't reproduce collision-settled
  populations (rested leaves reappear as marks only after natural falls);
  accepted as cosmetic.
- **Tuning surface**: five effects × art direction is the plan's real
  schedule risk; each effect is independently shippable, and the beam/fire
  debug triggers keep tuning decoupled from their future consumers.
- **Cleanup × loot plan file collision** (`arrow-*`, `events.ts`): sequence
  the implementation sessions, never concurrent.
- **Loot plan Phase 1 is blocked on this plan's WS-C + WS-F** — its step 8
  now calls `spawnLootBeam`, which exists only once the VFX core and beam
  workstream land. Noted in both documents.
