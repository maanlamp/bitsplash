# Weather System

- **Type:** feature
- **Date:** 2026-07-21
- **Status:** accepted

## Goal

An engine-owned weather layer — climates, scheduling, wind, rain exposure,
ambience direction — that _drives_ the visual and sonic systems rather than
living inside them. The demo scene comes alive: wind you can see in the
foliage and hear, rain that stops under overhangs and muffles inside caves,
weather that has honestly moved on when you step back outside.

## Context & problem

The VFX plan (`2026-07-20-feature-vfx-system.md`, accepted, unimplemented)
ships rain and leaf effects plus a `sampleWind(ecs, x, t)` seam with a dumb
global stub, and explicitly leaves weather scheduling out of scope. Audio has
no buses, no looping, no synthesis — every source connects straight to
`ctx.destination`. There is no game clock, no per-scene atmosphere metadata,
and the sky is a flat `clearColor`. Constraints that bound the solution:

- **Ambience-only.** Weather never touches physics or player movement. NPC
  reactions and gameplay coupling are explicitly future work.
- **Engine slice.** Weather is core engine functionality (`src/engine/weather/`).
  No registry-key indirection to smuggle game behavior into engine sampling —
  the user ruled registries-as-layering-dodge a violation. Named weather
  states are authored _data_, not code.
- **Serialization provenance** (AGENTS.md): run-state must ride the existing
  journal-onto-scratch construction; nothing new may filter components.
- **No save migration** (AGENTS.md): schema breaks crash loudly, pre-ship.
- **Audio is blocked** on a prerequisite audio-foundations plan (see
  Dependencies).

## Decision

Split **climate** (scheduling rulebook) from **presentation** (how a scene
shows the weather), keep run-state **global**, and derive everything else per
frame:

1. **Two independently scheduled scalars** — `wind` and `precipitation`
   (0..1) — plus a base wind direction. A **preset** is authored data pairing
   target values (e.g. `storm` = high/high, `drizzle` = low wind/low rain). No
   fused state axis: any mood is authorable without schema churn.
2. **Climates are global authored data** in `game/content/weather/`
   (JSON): preset list, weights, dwell ranges, default preset. Loaded into an
   engine-owned **climate registry** via a game-side registration side effect
   (the `registerSceneFile` pattern) — engine defines the schema and
   validates loudly at registration; the editor reads the same registry
   through the existing import order. An empty/absent catalog is the
   documented weather-disabled state (engine-only tests keep booting).
3. **Scenes carry only** an optional authored singleton `SceneClimateComponent`:
   `climateId: string | null` (null/absent = the catalog's default climate,
   resolved live — nothing is materialized into scene files) and
   `indoor: boolean`. Indoor means: inherit the current climate, keep the
   global state ticking, suppress particles/wind visuals, muffle audio.
4. **Run-state is one global persistent entity** (`WeatherStateComponent`,
   `PersistentComponent`-tagged, lazily self-ensured by the scheduler; a
   pre-existing duplicate crashes loudly). Serialized whole: climate id it was
   rolled for, current preset id, eased scalar values, rolled dwell remaining,
   wind direction, and PRNG state — so capture → restore → continue is exact,
   and a scene entry after restore causes no spurious reroll. Single state:
   entering a scene whose (resolved) climate id differs from the recorded one
   reconciles by a fresh weighted roll, eased.
5. **The scheduler is gameplay-only**; presentation/derivation systems run in
   a new `ambientSystems()` composition category (spread into `game` and
   `editorEdit` — `editorRun` is dead code; its docstring gets fixed).
   Transitions are eased scalar chases (no hard cuts); the envelope is the
   serialized scalars themselves, so restores resume mid-ease by construction.
6. **Overrides are presence-based and escape the climate, not presentation.**
   A sequence op spawns a serializable `WeatherOverrideComponent` entity;
   overrides supply _targets_ — the single eased scalar state always chases
   the highest-priority live override's targets, else the scheduler's, so
   override arm/despawn ramps like any transition (no hard cuts) and
   consumers always read the eased scalars.
   Ownership is recorded in `SequenceRunState` (the `spawnedRefs` precedent)
   with explicit despawn on finish, skip, and queued-def rollover — a leaked
   override is unrepresentable, not just discouraged. Indoor suppression still
   applies to overridden weather (the director hears the storm through the
   walls). Nothing may optimize on climate invariants (overrides bypass them).
7. **Wind** = per-preset base vector + a Farnell-style 3-band gust signal
   (slow wander ~0.1 Hz, gusts ~0.5 Hz with fast attack/slow release, flutter
   left to receivers via per-instance phase hashing), all stateless hash-noise
   over a shared **ambient clock**. `sampleWind(ecs, x, t)` is a plain engine
   function reading effective weather; the position parameter stays for future
   spatial variation (v1 ignores it).
8. **Rain exposure is derived, never authored.** A per-column `rainHeight[x]`
   from a tri-state `rainBlocking` classification on tile layers
   (`"auto" | "blocks" | "passes"`, auto follows collision) gates rain
   spawn/cull; particle collision (amended to the same classification) is the
   kill authority. Audio muffling: a multi-source BFS distance field from all
   rain-exposed air cells; volume + low-pass from path distance, pan from the
   openness-weighted centroid of nearby openings. Soft accumulated openness,
   temporally smoothed — no binary gates, no one-tile-hole flips. Both fields
   cache against (participating layer ids + flags + Σ `TileGrid.version`).
9. **Foliage sway v1 is whole-sprite shear** — top corners displaced by
   `sampleWind` × height, pinned at the base, quantized to texels, riding the
   VFX plan's corner-offset quad support. Per-instance phase/amplitude jitter
   on the gust band so no lockstep. Wind-weight masks / per-texel displacement
   are deferred to the roadmap.
10. **Audio direction** (blocked on audio-foundations): Farnell filtered-noise
    wind synth (gain _and_ center frequencies track wind speed), rain bed
    loops crossfaded by intensity, all on a weather/ambience bus. Pause
    suspends weather audio at the bus level (host-driven — a paused game ticks
    no systems). Editor audio is focus-gated.
11. **Editor**: live weather in edit mode at the resolved climate's default
    preset; a preview control scrubs presets/scalars (including
    climate-forbidden ones) through a **non-serialized per-world store**
    (`setWeatherPreview(ecs, …)`, module WeakMap keyed by ECS — structurally
    invisible to journal and tripwires), with an audio toggle. Scrub never
    writes components. Paused/single-stepped views keep audio suspended and
    render frozen.

## Alternatives considered

- **Single state axis** (clear→breezy→windy→rain→storm): rejected — fuses
  wind and rain, unrepresentable moods ("still heavy rain"), and the axis
  calcifies into palettes and saves (critique round 2, blocker).
- **Markov transition matrix**: rejected — three competing authorities
  (matrix vs weights vs derived states), palette masking strands the chain in
  absorbing subsets, and weighted-pick + dwell delivers the same felt result
  (critique round 1, blocker; research: first-order chains are already the
  ceiling for real weather generators).
- **Per-scene weather palettes owning scheduling data**: rejected — scene
  content unloads with the scene, forcing palette copies into run-state for
  the indoor case; the climate/presentation split dissolves the problem
  (user-driven reframe).
- **Per-scene run-state**: rejected — indoor scenes can't continue the
  outdoor storm without scene-relation machinery; `PersistentComponent`
  partition gives global state for free.
- **Registry-key wind-signal behavior** (the VFX plan's original seam):
  rejected by user ruling — weather is engine-owned; the key never ships.
- **Bounded overrides** (palette clamps the director): rejected — the
  director's tool must direct; presentation suppression stays scene-owned.
- **Buses inside this plan / visual-only v1**: rejected — audio-foundations
  is its own prerequisite plan; a silent storm isn't a storm, so weather waits
  for it rather than shipping half.
- **Authored interior/exposure zones**: rejected — dynamic derivation from
  tiles is shipped practice (Terraria/Minecraft/Vintage Story) and the user
  explicitly wants zero authoring here.
- **Sibling wind-mask PNGs, per-texel or per-row displacement**: deferred
  entirely — v1 sways whole sprites; masks collide with the sprite plan's
  metadata-in-container direction and per-URL eviction (critique round 3).
- **Per-climate retained run-states** (storm survives a detour): rejected by
  user — single state + reroll on climate change; multi-climate hops are rare
  in near-term content.

## Approach / steps

Workstreams. A is a prerequisite edit to an unimplemented plan (do first,
it's small). B → C/D/F can proceed in parallel after B lands its components;
E is externally blocked. G runs with each stream (tests land with the code
they cover).

### WS-A: VFX plan amendment (prerequisite, small)

1. Amend `docs/plans/2026-07-20-feature-vfx-system.md`:
   - Delete `WindComponent` and the registry-key signal field (never ships).
     `sampleWind(ecs, x, t)` stays engine, becomes weather-backed (stub reads
     a calm default until WS-B lands).
   - Re-home the ambient clock: `vfxTime` is replaced by
     `engine/weather/ambient-clock.ts` (created in WS-B step 4). VFX and
     weather read the same clock.
   - Fix the step-13 contradiction: VFX preview/update systems belong in
     `ambientSystems()`, never `editWorldSystems` (which `game` also spreads —
     double-step hazard the plan itself documents).
   - Rain effect: kill predicate uses the rain-blocking classification (WS-C)
     instead of raw solidity; spawn/cull consults `rainHeightAt`; emitter
     defs gain a weather-scaling field (emission rate scaled by effective
     precipitation/wind — read per frame by the VFX update, defs stay frozen
     config). The "consumers never change" contract is amended to name these
     three hooks.

### WS-B: engine weather core (`src/engine/weather/`)

2. `climate.ts` — schema + validation: `ClimatePreset` (id, wind target,
   precipitation target, base direction), `Climate` (id, presets, weights,
   dwell ranges, `defaultPreset`). Validation throws on: empty presets,
   all-zero weights, default not in presets, degenerate dwell ranges
   (negative, min > max). Runs at registration, all builds.
3. `climate-registry.ts` — engine registry: `registerClimateCatalog(catalog)`
   (`defaultClimateId` is a required field of the catalog JSON, passed
   through), `resolveClimate(id | null)` (null → default; dangling id → loud
   throw on first resolve, i.e. scene entry/first frame), `hasClimates()`
   (false = weather disabled). Game side:
   `game/content/weather/climates.json` + registration side effect in
   `src/game/registrations.ts`.
4. `ambient-clock.ts` — per-world accumulated-seconds store +
   `AmbientClockSystem` (in `ambientSystems()`; pause-frozen because paused
   hosts tick nothing; deliberately non-restorable). Consumed by gusts,
   sway, and VFX — the WS-A amendment re-points the VFX plan here instead of
   its system-owned `vfxTime`.
5. `scene-climate-component.ts` — `@serializable("SceneClimate")` authored
   singleton: `climateId: string | null = null`, `indoor = false`. No
   migration materializes it; absence = default climate, outdoor. Editor
   inspector shows a catalog-backed picker (dangling ids unrepresentable in
   authoring) — WS-F.
6. `weather-state-component.ts` — `@serializable("WeatherState")`:
   `climateId`, `presetId`, `wind`, `precipitation`, `direction`,
   `dwellRemaining`, `rng` (serialized PRNG state, e.g. mulberry32). Lazily
   self-ensured by the scheduler **with** `PersistentComponent`; a single
   existing instance (restore) is adopted; a second instance crashes loudly.
7. `weather-override-component.ts` — `@serializable("WeatherOverride")`:
   preset id or explicit scalar targets, `priority` (equal priority:
   later-spawned wins — deterministic and save-stable via entity id order).
   Scene content, deliberately **not** persistent — an override dies with its
   scene by construction; cutscenes are scene-scoped.
8. `weather-scheduler-system.ts` (gameplay-only, in `gameplaySystems`):
   ensure state entity — first-ever ensure seeds preset + scalars at the
   active climate's `defaultPreset` and rolls a dwell; resolve the active
   scene's climate (via `SceneClimateComponent` query, absent → default); on
   climate-id mismatch with the recorded id → weighted roll + fresh dwell
   (the one reconcile rule); count down dwell, pick the next preset by
   weights (PRNG), and each frame ease the scalars toward the effective
   targets (override targets when one is live, else the current preset's).
9. `effective-weather.ts` — pure per-frame derivation of the effective
   _targets_ and presentation mask: editor preview store (top priority) →
   highest-priority live `WeatherOverrideComponent` → scheduler preset; in a
   world with no `WeatherStateComponent` (edit worlds — the scheduler never
   runs there), scalars fall back to the resolved climate's `defaultPreset`
   targets directly. Consumption split: **visual consumers read masked
   values** (`sampleWind` returns calm and precipitation reads 0 in `indoor`
   scenes — foliage stills, particles stop), **audio reads raw scalars** plus
   the exposure muffle (muffled ≠ silent).
10. `gust.ts` + `sample-wind.ts` — 3-band stateless hash-noise gust signal
    over the ambient clock, shaped fast-attack/slow-release;
    `sampleWind(ecs, x, t)` = effective (masked) wind scalar × gust envelope,
    base direction. Position parameter reserved.
11. Sequence op (`engine/sequence/engine-ops.ts`): `weatherOverride` op —
    `arm` spawns the override entity and records it in a new
    `SequenceRunState.ownedOverrides: EntityId[]`; despawn on op `skip`, on
    sequence `finish`, and on queued-def rollover (the entity-reuse path in
    `sequence-system.ts` clears owned overrides before installing the next
    def). Headless test proves all three paths.

### WS-C: exposure (`src/engine/weather/`)

12. `TileLayerComponent.rainBlocking: "auto" | "blocks" | "passes"` (default
    `"auto"` = follow `collision`); inspector `options` picker (existing
    precedent). No file migration needed (absent field → default).
13. `exposure-field.ts` — per-column `rainHeight[x]` over the merged
    rain-blocking cells; multi-source BFS distance field through air cells
    from all rain-exposed cells (bounded window around the camera; cost
    clamped at the border). Cache keyed on participating layer ids + flags +
    Σ `TileGrid.version` + the quantized window origin (camera movement
    rebuilds), checked per frame.
14. `exposure.ts` — consumer API: `rainHeightAt(ecs, gx)`,
    `exposureAt(ecs, x, y)` (soft openness 0..1 accumulated over nearby
    exposed cells), `rainAudioAnchor(ecs, x, y)` → `{ distance, centroid }`
    (openness-weighted centroid panning — no nearest-opening flip-flop).
    Zero exposed cells in the window (fully enclosed interiors) → clamped
    max-distance, zero-openness result — deep muffle falls out, no special
    case. The `indoor` flag additionally clamps openness to a low ceiling
    (an indoor scene with sky-exposed cells still reads as inside). Temporal
    smoothing lives in the consumers (a few hundred ms).

### WS-D: presentation consumers

15. `foliage-sway-component.ts` (engine/weather; opt-in marker: amplitude,
    pinned-base flag) + a hook in `SpriteRenderSystem`: sprites with the
    marker render with top-corner shear = `sampleWind(ecs, x, ambientTime)` ×
    height, texel-quantized, per-instance phase/amplitude jitter hashed from
    entity id. Rides the VFX plan's corner-offset quads (WS-A dependency).
16. `weather-presentation-system.ts` (in `ambientSystems()`): steps derived
    per-frame published parameters (effective scalars, gust phase, exposure
    maintenance tick) so consumers read coherent values; applies the
    `indoor` visual mask.
17. VFX wiring (lands with/after the VFX plan): emitter defs gain a
    weather-scaling field (the third WS-A contract hook) — rain emission
    scales with effective (masked) precipitation, leaf rate with wind; both
    sample `sampleWind` per the amended contract. Weather publishes, never
    renders.

### WS-E: audio (blocked on the audio-foundations plan)

18. `weather-audio-system.ts` (in `ambientSystems()`): wind synth graph —
    filtered-noise voices (background turbulence, eave breeze BP ~200 Hz,
    whistle BP ~400 Hz, leaf hiss) with gain and center frequency tracking
    raw effective wind × gust envelope; rain bed — intensity-tiered loops
    crossfaded by raw precipitation, volume + low-pass + pan driven by
    `rainAudioAnchor` at the listener. All sources on the ambience bus.
19. Pause/suspend: hosts (`Game.setPaused`, `RunHost`) suspend the ambience
    bus (~100 ms ramp) — bus-level, host-driven, no system tick required.
    Single-step while paused stays suspended.

### WS-F: editor

20. `compositions.ts`: new `ambientSystems()` list (ambient clock, weather
    presentation, VFX per amendment) appended **after** `gameplaySystems` in
    `game` (the VFX plan requires post-camera, pre-event-clear ordering) and
    after `editWorldSystems` in `editorEdit`; fix `editorRun`'s stale
    docstring (dead code — the editor run world is built from `game` via
    `platformer-runtime.registerSystems`).
21. `engine/weather/preview.ts` — `setWeatherPreview(ecs, preview | null)`:
    module WeakMap keyed by ECS; read by `effective-weather.ts` with top
    priority. Non-serialized by construction — invisible to journal, tripwires,
    and saves.
22. Editor preview UI: preset picker (full catalog, including
    climate-forbidden), wind/precipitation scrub sliders (editor sliders are
    fine), audio toggle. Scrub writes the preview store only — never
    components. Default view state: resolved climate's default preset. This
    step also owns the audio focus wiring: weather audio plays only for the
    focused scene view; unfocus, run-start, and view close suspend it.
    Placement: a popover off the scene view's floating toolbar (the
    debug-overlay-popover precedent) — no dependency on the sprite plan's
    docked toolbar primitive; explicitly a migration candidate in the
    roadmap's top-toolbar adoption audit.
23. `SceneClimateComponent` inspector: catalog-backed climate picker +
    indoor checkbox; adding the component to a scene is the normal
    component-add journal path.

### WS-G: tests (land with each stream)

24. Extend `SequenceFixture`: climate catalog fixture registration; weather
    scheduler boot; capture → restore → continue → assert exact scalar/dwell/
    PRNG continuity across a preset pick boundary.
25. Provenance: run a simulated world with weather + override, save the scene
    document, assert the artifact contains no `WeatherState`/`WeatherOverride`
    (existing tripwires enforce; test documents).
26. Exposure: authored tile fixtures — overhang, cave with side mouth,
    one-tile hole, fully enclosed room; assert rain height, soft openness
    (hole ≠ binary flip), centroid anchor, clamped enclosed result; cache
    invalidation on tile edit, `rainBlocking` flag change, and window move.
27. Override lifecycle: finish / skip / queued-rollover all despawn;
    mid-cutscene save restores the storm; equal-priority tie-break; indoor
    suppression applies to an overridden storm; override arm/despawn ramps
    (no hard cuts).
28. Reconcile: scene entry with different climate rerolls once (PRNG-pinned);
    restore causes no spurious reroll; dangling climate id in authored data
    throws on first resolve.

### Dependencies

- **Audio-foundations plan (to be written, separate session).** Weather WS-E
  consumes only finished capabilities. That plan must deliver: master +
  category buses (M-P1-7) with host-reachable suspend/duck; looping playback
  handles; per-source filter + pan; a noise/synthesis source primitive;
  world-scoped audio ownership with engine-driven teardown (loops must not
  survive world disposal — run stop, quit, load); a null/headless backend
  (today's harness audio stub throws, `AudioContext` doesn't exist under
  Bun); shared settings _state_ with per-host surfaces (game canvas UI and
  editor DOM UI can't share components), mounted in both the shipped pause
  menu and the editor.
- **VFX plan** (accepted, unimplemented): WS-A amends it; WS-D/16 needs its
  emitters and corner-offset quads to see weather on screen. Weather core
  (WS-B/C) has no VFX dependency and can land first.

## Research findings that drove this

- **Two-layer consensus in shipped 2D games** (Terraria per-tick RNG,
  Stardew daily roll, Celeste/Hollow Knight authored): discrete scheduling
  over continuous envelope-eased scalars, hysteresis where states derive from
  scalars, scripted-override layer above the scheduler, and **wind as a
  global time-varying value everywhere** — position variation is
  presentation-side masking, never simulation (Terraria shipped
  `windPhysics` disabled).
- **Community pain** (what this design routes around): weather RNG gating
  content; cosmetic-but-intrusive weather (FPS, readability, audio fatigue);
  rain audio identical indoors (Project Zomboid); binary shelter gates
  (Vintage Story's jarring canopy jump) and one-tile-hole flips (Starbound);
  "always raining after load" (Anno 1800) — weather run-state serializes
  whole; the best-loved weather in the genre (City of Tears) is authored,
  thematic, gives mood not friction.
- **Dynamic exposure is shipped practice**: Terraria (particle collision +
  wall checks), Minecraft (per-column heightmap + emit-rain-sound-from-
  nearest-landing-point — the path-distance muffling trick adopted here),
  Vintage Story (`RainHeightMap` maintained on block edits).
- **Farnell's wind decomposition** (Designing Sound): one shared 3-band
  control signal (wander/squall/gust) driving every sounding and visible
  element — coherence between eye and ear by construction; synthesis voices
  whose gain _and_ frequency track wind speed.
- **Codebase verdicts from three adversarial critique rounds** (all verified
  with file:line evidence): edit-mode preview cannot be an entity (journal +
  tripwire architecture); `editorRun` is dead code; sequence entities are
  reused across queued defs (ownership must be run-state-scoped); `M-P1-7`
  alone doesn't cover weather audio (hence the foundations plan);
  `PersistentComponent` partition is the free carrier for global state;
  authored singleton beats `SceneConfig` (triple hand-projection the
  tripwires don't cover); catalog must be an engine registry (scene loading
  never sees `GameModule`).

## Risks & open questions

- **The scheduler may rarely be witnessed** — dwell times of minutes ×
  short sessions means most sessions see zero transitions. Mitigation: the
  demo climate should be tuned punchy (short dwells) until playtests say
  otherwise; the editor scrub makes all states reachable instantly.
- **Audio-foundations slippage** leaves weather visually complete but silent;
  WS-E is cleanly severable, but "the point of the system" (sonic ambience)
  waits on it. Sequence that plan promptly.
- **Wind synth steady-state sameness**: filtered noise can read as a flat
  bed after minutes; the wander band and gust asymmetry are the mitigation,
  but budget a tuning pass with real ears (dev-run listening, per AGENTS.md
  visual/sonic validation rules).
- **Gust phase pops on restore** (ambient clock is deliberately
  non-restorable per the VFX plan's doctrine) — accepted; scalars resume
  exactly, only gust phase jumps.
- **Edit-mode particle cost** in large scenes: bounded by the same budgets as
  run mode; if it annoys, the preview control's "calm" scrub is the escape
  hatch (a persistent editor setting is a later nicety).
- **Sky/light tint is a non-goal here**: effective weather publishes the
  scalars a future tint/parallax consumer needs; nothing in this plan darkens
  the sky. Storms will read via rain, wind, foliage, and audio until a
  dedicated visual pass exists.
