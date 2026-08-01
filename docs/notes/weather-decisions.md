# Decisions made autonomously (weather system impl, 2026-07-29)

Branch: `feature/2026-07-21-weather-system`. Baseline: 840 tests green.
`bun check` = oxlint --fix && oxfmt && gen && tsc -b && bun test.

User's overnight instructions:

- Implement `docs/plans/2026-07-21-feature-weather-system.md`.
- ALSO build sway prerequisites (corner-offset quads).
- ALSO a simple audio layer now so weather is audible, despite audio-foundations
  being a separate future plan.
- ALSO "implement what's needed for particles (just not the whole editor part)"
  so there's a functioning slice to flesh out later per the VFX plan.
- Stashed `entity-placement-todo.md` (stash: "entity-placement-todo (pre-weather-impl)").

## Decisions

1. **VFX scope pared to what particles need.** From the VFX plan I take: animation
   primitives (Timeline/Ease/Keyframes), per-draw blend + public corner-quad API,
   VFX core (def schema, EmitterComponent, instance-owned store, update+render
   systems), and two effects: rain + leaves. I deliberately SKIP: the Tween
   rewrite / FadeTimeline+Easing deletion / WS-I cleanup migration (that is
   cleanup, not "needed for particles", and it touches camera/fade/dialogue),
   blood, loot beam, fire, flipbook parts, beam-quad parts, decal system, the
   per-layer-blend rip-out, and all VFX editor authoring UI. New primitives land
   BESIDE the existing easing/tween code rather than replacing it.

2. **Roadmap needed no edit** — it already carries the audio-foundations,
   weather-quality-toggle, foliage-mask and top-toolbar-audit entries the
   weather plan deferred. WS-A committed as `862f9bd`.

## Phase plan

Pre-commit by me (settles cross-worker contracts): `scene-climate-component.ts`.

Phase 1 (foundations, 4 workers):

- W1 `engine/animation/`: Timeline, Ease, Keyframes(+Number/Color). Additive only —
  no deletion of Easing/Tween/FadeTimeline.
- W2 `engine/render/`: per-draw blend (normal|additive) + public textured-corner
  quad API. No per-layer-blend rip-out.
- W3 `engine/weather/` core: climate schema+registry, ambient clock, state/override
  components, effective-weather, preview store, gust+sampleWind, scheduler,
  presentation system, `ambientSystems()` in compositions, climates.json content,
  SequenceFixture extension.
- W4 `engine/weather/` exposure: `TileLayerComponent.rainBlocking`, exposure-field
  (rainHeight + BFS), exposure consumer API.

Phase 2 (4 workers): W5 VFX core; W6 foliage sway; W7 weather audio (simple);
W8 `weatherOverride` sequence op + ownedOverrides lifecycle.

Phase 3 (2 workers): W9 rain + leaves effects (game layer); W10 editor surfaces
(weather preview popover, SceneClimate inspector, rainBlocking picker).

Overlap zones: `src/game/compositions.ts` (W3 creates ambientSystems; W5/W7 append
to it), `src/game/registrations.ts` (W3 climates, W9 vfx defs),
`src/engine/sprite/sprite-render-system.ts` (W6 only).

3. **No headless QA by me (user instruction, mid-run).** Interpretation applied:
   - Workers still write the tests the plan's WS-G specifies (plan scope, and the
     regression guard AGENTS.md requires).
   - `bun check` (oxlint + oxfmt + gen + tsc -b + bun test) still runs as the gate
     — it is the project's own mandated command, not exploratory QA.
   - NO ad-hoc headless validation harnesses, NO `bun run dev`, NO temporary-logging
     inference, NO claims that behavior/visuals/audio are verified.
   - All behavioral, visual and sonic acceptance is routed to the user at handoff
     as an explicit "please check X" list.

4. **VFX plan's additive blend factors were wrong; corrected.** The plan specified
   `blendFuncSeparate(SRC_ALPHA, ONE, ZERO, ONE)` on the premise of a premultiplied
   scratch target. Verified false: textures upload straight-alpha
   (`UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`, `renderer-2d.ts:572-573`) and the
   scratch's normal fill is `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`.
   Shipped `(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)` — the alpha pair must keep
   accumulating coverage, not pin it; `ZERO, ONE` would have broken the composite.
   Amended the VFX plan (pillar 3 bullet, step 8, and the research note) to match.
   **Still needs your eyes** — blend is not headlessly assertable.

5. **Audio design forced by the current engine** (see the 2026-08-02 plan): availability
   gated on `typeof AudioContext !== "undefined"` (structural, keeps the harness's
   throwing audio Proxy untouched); ONE process-wide ambience graph with
   last-writer-per-frame and a ~150 ms self-ramp to silence when nobody pushes
   (kills the world-teardown leak AND gives pause-suspend for free, since a paused
   host ticks no systems); rain/wind both procedurally synthesized (no rain asset
   exists and I can't audition one I author); `audio.ts` changes strictly additive.

6. **Override leak-proofing strengthened beyond the plan.** Plan step 11 wants despawn
   on "op skip, sequence finish, queued-def rollover", but `OpExecutor` has no `finish`
   hook (lifecycle is arm/poll/skip) and explicit despawn still misses the sequence
   entity being destroyed outright (which tests do). Added an owner-id field on
   `WeatherOverrideComponent` plus poll-based reclaim modelled on
   `camera-2d-follow-system.ts:140-160` — that is what actually makes a leak
   unrepresentable, which is the plan's stated goal.

7. **Climate catalog uses static JSON imports, not `import.meta.glob`** — glob throws
   under `bun test` (documented at `game/reaction/loader.ts:39-44`), which would have
   made the catalog unreachable from headless tests.

8. Skipped the VFX plan's step 7 per-layer-blend rip-out (verified dead code, but not
   needed for particles). `applyLayerBlend` did get folded into `applyQuadBlend`.

## Integration log

- `862f9bd` WS-A: VFX plan amended (ambient clock re-homed, WindComponent + registry-key
  deleted, editWorldSystems->ambientSystems contradiction fixed, rain's 3 weather hooks,
  consumer contract amended).
- `9acd274` `SceneClimateComponent` pre-committed as the phase-1 shared contract.
- `e098591` W2 renderer: `QuadBlend`/`applyQuadBlend`, `drawCornerQuad(id, opts)`,
  `shear` on `DrawImageOpts`, `quantizeToTexel(value, zoom)`. Check green 845/143.
- `5e6269b` VFX plan additive-blend correction (decision 4).

## Gotcha for this run: worker worktrees are NOT branched from my HEAD

Observed base commits: W1 at `6bf95cd`, W3 at `b8c0e93` (an old ancestor!), W4 at `e098591`.
So a worker may not see my pre-committed shared contract. Had to SendMessage W3 the exact
contents of `scene-climate-component.ts` to recreate. **Verify worktree base before relying
on a pre-commit as a shared contract**, or just inline the contract into every prompt.

## Contracts phase 2 must honour (from phase-1 worker reports)

Renderer (`8a744c7` lineage):

- `type QuadBlend = "normal" | "additive"`; `applyQuadBlend(gl, mode)` (replaced
  `applyLayerBlend`). Blend is in BOTH merge keys.
- `drawCornerQuad(id, opts: DrawCornerQuadOpts)` where
  `{px: ReadonlyArray<number>/*4, TL TR BR BL*/, py: same, image?: TileSource,
uv?: ReadonlyArray<number>/*8, default [0,0,1,0,1,1,0,1]*/, tint?, alpha?, blend?}`.
  **Omit `image` => solid `tint` via whiteTex on ONE shared merge key** (the cheap
  particle path). `px/py/uv` are ReadonlyArray not tuples deliberately, so a particle
  hot loop can reuse mutable scratch arrays without casts. World y is DOWN: indices 0,1
  are the top corners.
- `DrawImageOpts` gains `shear?: number` (world units, top two corners, applied after
  `rotateCorners`, default 0) and `blend?: QuadBlend`. `shear` also affects
  `drawImageOutline` (shared `imageQuad`) — an outline follows its sprite.
- `quantizeToTexel(value, zoom)` in `render/quantize.ts`.
- `drawStaticBatch` forces `"normal"` (static batches have no per-quad blend).

Animation (`8a744c7`):

- `Timeline` `@serializable("Timeline")`: `duration/elapsed: Seconds`, `rate: number`
  all `@serialize`d and settable; `tick(dt: Seconds)`, `t()`, `done()`, `remaining()`,
  `restart(duration?)`. `duration` is a branded `Seconds` NUMBER, not the `Duration`
  value type.
- `Ease` `@serializable("Ease")`: readonly `x1,y1,x2,y2,label`; `at(phase)` (phase
  clamped to [0,1], **result unclamped** so overshoot survives); `copy()`; 10 frozen
  static presets.
  **TRAP: `deserialize` fills value-type fields IN PLACE, so a `@serialize`d field
  holding a FROZEN preset throws on load.** A container's default must be an unfrozen
  instance — `new Ease()` or `preset.copy()`.
- `Keyframes<T>` abstract + `KeyframesNumber` (with `static fromTo(from,to,ease?)`) and
  `KeyframesColor`. `keyframe(t, value, ease?)` factory. Ctor throws if keys are out of
  time order; `sample(t)` throws if no keys; out-of-range `t` holds the endpoint.
  Per-segment ease belongs to the key that STARTS the segment (CSS convention).
- **`KeyframesColor` interpolates numeric `RGBA` (`[r,g,b,a]` 0..1), NOT the css-string
  `Color`** — using `Color` would mint a string per sample and poison the module-level
  `ColorResolver` cache. => **the VFX def loader must convert authored css colour
  strings to RGBA ONCE at load.** `sample()` allocates a fresh tuple per call; no
  zero-alloc `sampleInto` exists yet (add one if the particle hot path needs it).

9. **`demo.scene.json` was edited, deliberately.** My brief told W4 no scene-file change
   was needed; that was wrong. `test/scene-document-save.test.ts:77-79` ("a no-op save
   reproduces the migrated baseline byte-for-byte") compares `doc.save()` against the
   COMMITTED artifact, not just self-consistency — so the new defaulted `rainBlocking`
   field made the save emit two extra `"rainBlocking": "auto"` lines. Resolution: update
   the artifact to exactly what the editor now writes on first save, rather than add a
   migration or weaken the test. Keeps AGENTS.md's "test the artifact" assertion intact.
   No migration code exists; absent-field defaulting still works for every other scene.

10. **Exposure window centres on the active camera** (`pickActiveCamera2D`), falling back
    to world origin when there is none — chosen over centring on the sample point so a
    single cache entry can't thrash between consumers at different positions.
    `indoor` clamping is applied in `exposureAt` only, not in `rainAudioAnchor` (a uniform
    openness clamp leaves the centroid unchanged; indoor muffling is the audio layer's call).

## Exposure contract for phase 2

`rainHeightAt(ecs, gx): number | null` — a GRID ROW (topmost blocking tile), `null` = column
open all the way down; multiply by `TILE_SIZE`. Covers every authored column, not just the
window. `exposureAt(ecs, x, y): number` (0..1 soft openness, `indoor`-clamped by
`INDOOR_OPENNESS_CEILING = 0.2`). `rainAudioAnchor(ecs, x, y): {distance, centroid}` in
**world units**. `exposureField(ecs)` is the cached field (poll per frame);
`disposeExposureField(ecs)`. `rainBlockingLayers(ecs)` in `tilemap/occupancy.ts`.
`RAIN_BLOCKING_MODES` / `RainBlockingMode` exported from `tile-layer-component.ts`.
Sealed room => openness 0, distance `EXPOSURE_MAX_DISTANCE`, centroid = sample point, with
no special case.

## PHASE 1 COMPLETE — `dc4ee02`, 968 pass / 150 files

`3a3f184` exposure, `dc4ee02` weather core (rebased clean onto my tip, no conflicts).

11. **No double-step — verified, not assumed.** `editorEdit` reaches a world only via the
    `SceneFactory` in `game/scenes/platformer.ts:22`, whose module is imported ONLY by
    `src/main.tsx` (editor entrypoint), never `game-main.tsx`. The shipped game AND the
    editor's run world both come from `platformer-runtime.buildRuntime` on a fresh World with
    the `game` composition alone. So `ambientSystems()` steps exactly once per world. The
    hazard was hypothetical — had it been real, `editWorldSystems` would already double-step.
    `editorRun` confirmed dead; docstring rewritten to say so and name the real path.

12. **Climate schema restructured: presets are a catalog-wide table, not per-climate lists.**
    The plan had `Climate` carrying "presets, weights, dwell ranges". Split into one top-level
    `presets` table plus per-climate `entries: {preset, weight, dwellMin, dwellMax}[]`. Why:
    `resolvePreset` becomes unambiguous (both overrides and the editor preview must reach
    climate-forbidden presets), two climates can't disagree about what `storm` is, and fusing
    weight+dwell into one row makes misaligned parallel lists unrepresentable.
    `Climate.defaultPreset` is a resolved reference and `totalWeight` is precomputed-positive,
    so "default not in presets" and divide-by-zero are unrepresentable post-validation.

13. **A registered catalog with zero climates throws**; weather-off is `hasClimates() === false`
    i.e. no registration at all. (`defaultClimateId` is required and couldn't resolve otherwise.)

14. **Equal-priority override tie-break is lexicographically-greatest entity id, not literally
    "later-spawned".** Entity ids are random UUIDs carrying no creation order, and a serialized
    monotonic counter wouldn't survive a process restart cleanly. Id order is total and
    identical before/after a save, which is the property the plan actually needs.

15. **Scheduler PRNG seed is constructor-injected** (`seed?: () => number`, default
    `randomRngSeed`) — shipped playthroughs differ, tests pin. Follows the existing
    `Rng = () => number` seams.

16. **Override reclaim lives in the scheduler, not presentation** — load-bearing: reclaim calls
    `ecs.destroy`, which in the editor's live edit world would trip the save tripwire. Runs
    before the `hasClimates()` early-out so explicit-scalar overrides are reclaimed with weather
    off. `owner === null` = authored scene content, never reclaimed.

17. Two files beyond the plan's list: `engine/noise.ts` (`hash1`/`smoothstep`/`valueNoise1` —
    `engine/hash.ts` left completely untouched so `hashCell`'s never-time-based contract isn't
    even edited) and `engine/weather/weather-frame.ts` (per-frame published store, split out so
    the presentation system file holds only its class). `engine/rng.ts` new at the engine root.

18. Type-safe cross-refs: `game/weather/climate-ids.ts` holds `CLIMATE_IDS` /
    `WEATHER_PRESET_IDS` `as const` + guards; `climate-catalog.ts` cross-checks the JSON's ids
    against those tuples at load and throws naming the file, so a one-sided rename fails loudly.

19. **Foliage sway `pinnedBase` semantics were unspecified; defined as the anchored edge.**
    `true` (default) pins the base and shears the top; `false` pins the top and swings the
    bottom (hanging vines/moss), as `offsetX = lean, shear = -lean` so both edges stay
    texel-aligned with one magnitude.
    Component lookup is `ecs.getComponent` per sprite (two O(1) map gets) rather than a hoisted
    query — sway is opt-in and rare, so a hoisted query would cost a full world pass + Map build
    per frame to serve a handful of entities.
    Tuning numbers the plan didn't specify: amplitude `0.15` (~10px lean on a 64px sprite at
    full gale), +/-35% per-instance jitter, 4 s phase spread (wider than one ~2 s gust cell).
    Expect to tune these once seen.

20. **AUTHORED CONTENT ADDED BEYOND THE PLAN'S LITERAL STEPS (flagging explicitly):** added
    `FoliageSway` to the 11 `birch.png` entities in `demo.scene.json`. Rationale: the plan's Goal
    is "the demo scene comes alive: wind you can see in the foliage", and WS-D/15 only ships the
    mechanism — without this the promised visible outcome doesn't exist and you'd have to author
    it by hand before seeing anything. Trivially revertable (one commit, `2ca7614`).
    Verified the committed-artifact byte-compare test (`scene-document-save.test.ts:77-79`) still
    passes, which proves the serializer reproduces the insertion exactly.
    Note: the demo scene has **no `SceneClimate`** component, so it inherits the catalog default
    — use the editor weather preview to force a gale. Grass/decoration foliage is drawn by
    `DecorationsRenderSystem` and is NOT `SpriteComponent`-based, so it does not sway in v1.

> **Superseded.** Weather audio shipped interim; decisions 21–25 (the voice graph,
> `silenceAfter`, the gust/saturation coupling) and the list of what audio
> foundations still owed were removed once
> `docs/plans/2026-08-02-feature-weather-expansion.md` replaced them. That plan also
> measured two defects this session left behind: the per-frame ramp re-issue in
> `playLoop`, and `DEFAULT_TAU = 8 s` against the 8–20 s dwells set in decision 46.

## weatherOverride op (`c2a93ba`), 1031 pass / 153 files

26. **Ambient sequences ARE allowed to drive weather** (no `takeCamera`-style exclusive-only
    assert). Reasoning: the camera is exclusive-only because there is exactly one camera and no
    arbitration, so two claimants is a bug with no defined answer. Weather overrides are
    priority-arbitrated with a total, save-stable tie-break, so concurrent claimants have a
    defined winner rather than a conflict — and "a storm rolls in over this area" is precisely an
    ambient-loop concern. Covered by an `AMBIENT_STORM` test that fails if a guard is added.
27. Idempotence uses ONE serialized memory key, `memory.overrideId`, carrying three states:
    `undefined` = not armed, `EntityId` = live, `null` = released. Makes "armed but with no
    override" unrepresentable instead of needing a separate `issued` flag.
28. **Two dead-ish code paths, reported not redesigned:** the op's `skip` release branch and its
    repeat-`arm` guard are both unreachable through the _current_ interpreter, because `poll`
    returns `true` on the same tick the step arms, so the step is always `completed` before a
    fast-forward reaches it and `arm` is only ever called once. Both are kept for contract
    correctness (a future op whose `poll` waits would need them). The guard is pinned by a
    deliberately white-box test that calls `arm` twice against one memory record; the behavioural
    "skip despawns the storm" outcome flows through `SequenceSystem.finish`.
29. Override release happens at the TOP of `SequenceSystem.finish`, before the rollover's
    `component.run = new SequenceRunState()` reset. Moving it after that line makes exactly the
    rollover test fail — which confirms the plan-correction was real.

## Editor weather surfaces (`f20bef7`), 1045 pass / 154 files

30. ~~**The audio mute reuses the ambience contract rather than adding a bus.**~~
    **Superseded** by the per-view bus in the 2026-08-02 plan. `AudioManager` has
    no mute/bus (unbuilt audio-foundations dependency) and the editor may not edit `src/engine/`.
    So a muted view steps its world normally (foliage still sways, rain still falls) then pushes
    an all-zero mix at the same graph — `weatherAudioMix({wind:0,precipitation:0,gust:0},
OPEN_SHELTER)`, last-push-wins. No magic numbers, no fake `AudioManager`, no engine change.
    Decays inaudible in ~0.3 s. Same architectural shape as `RunHost`'s muted `Input`.
31. UX choices where the plan was silent (all conventional, all reviewable):
    preview installs **lazily** so merely opening the popover changes nothing; a **"Reset to
    climate default"** button (the plan gave no way back to un-previewed); picking a preset
    **re-seeds both sliders** so stale explicit scalars can't silently override it; **no direction
    control** (plan names wind + precipitation only, direction defers to the preset); mute is
    **per scene view**, not global/persisted, and covers authoring only (a run's world owns audio);
    sliders show **percentages** with live `onValueChange` since scrubbing is the point;
    weather-off shows a one-line empty state rather than hiding the trigger; the climate picker's
    null option is labelled **`Default (<id>)`**, naming what it inherits.
32. A **dangling `climateId` throws** when seeding preview state (via `resolveClimate`) — no
    fallback added deliberately: the edit world's presentation system already throws every frame
    in that case, and the picker makes dangling ids unauthorable. Seeding is lazy so it cannot
    break scene-view construction.
33. ~~Known pre-existing limitation~~ — **fixed** by per-realm focus listeners in the
    2026-08-02 plan. As found: **two windows each with a focused scene
    view would both push ambience** and fight over the graph frame by frame.
34. Verified free-for-nothing (implemented nothing): only `viewId === focusedId` calls
    `view.update` (`app.tsx:1328-1331`); **no** scene view updates while a run is active
    (`app.tsx:1319-1321`), so run-start hands ambience to the run world; view close stops updates
    and the graph self-fades. Confirmed `rainBlocking` renders in the generic inspector and
    `SceneClimate` is still addable via the entity context menu (both asserted in tests).

## VFX particle core (`606d07e` -> integrated), + provenance test `e7675f6`. 1091 pass / 159 files

Resolved the one designed conflict in `compositions.ts` myself: kept the VFX worker's
`ambientSystems(vfx: VfxUpdateSystem)` signature (the pair shares a store instance, so its
halves land in two lists) and re-added `new WeatherAudioSystem()`. Final order:
AmbientClock, WeatherPresentation, vfx, WeatherAudio. Merged both docstring edits.

35. **`Object.freeze` on `EmitterComponent` was NOT viable and was replaced.** The plan wanted a
    dev-build freeze, but the editor's command router writes the live instance in place
    (`journal-entry.ts:215`), so freezing would break emitter authoring — the exact surface
    preview exists for. Shipped `readonlyEmitter()`: a WeakMap-cached dev-build Proxy that throws
    on write, plus `Readonly<EmitterComponent>` at read sites. Caveat: guards field writes, not
    mutation through `offset` (a Vector2).
36. **`(layer, order)` is def-only, not per-emitter-instance** (the plan listed it on the component
    too). A per-instance override multiplies full-viewport render targets. Enforced as a
    catalog-wide cap `VFX_MAX_RENDER_SLOTS = 4`, hard-error at load, with one memoized
    `resolveRenderLayer` per slot per frame.
37. **No `spawnAttached`.** An attached emitter is an `EmitterComponent` on the host so it
    re-derives on thaw; a store-direct attachment would silently vanish on load.
38. Component removal vs host death deliberately differ: removal evicts outright;
    `ecs.onDestroy` detaches and lives out, baking `local` pools to world space.
    **KNOWN LIMITATION:** a scene change destroys entities the same way, so a particle remnant can
    outlive its scene, bounded by `lifetime.max`. Tightening needs a scene-transition signal
    `Runtime` does not expose. Documented at `VfxStore.detach`.
39. Weather scaling formula: `rate _ rateScale _ lerp(1, visiblePrecipitation, precipInfluence)
    - lerp(1, visibleWind, windInfluence)` on the **indoor-masked** scalars — influence 0 ignores
      weather, 1 tracks exactly, indoors stills it for free.
40. Collision cells are re-merged per frame (only when a part actually collides) rather than
    version-cached; the shared cached utility is VFX plan WS-D step 20, not built.
41. Def validation **rejects unknown JSON keys** and **derives pool capacity** from
    rate/lifetime/burst (ceiling 8192), so a typo or a hand-typed too-small pool is unrepresentable.
42. Added `ECS.hasDestroyHook(cls)` (16 lines, additive) so the VFX registration site can assert
    nobody else claimed `EmitterComponent` cleanup — `onDestroy` is last-writer-wins and would
    otherwise silently unhook. Also `KeyframesColor.sampleInto` (zero-alloc) with the segment
    search extracted; `sample()` behaviour unchanged.
43. AGENTS.md gained the doctrine note: VFX run-state is deliberately non-restorable, the one
    documented exception to "snapshots resume everything", with `test/vfx-snapshot.test.ts` named
    as the tripwire.

44. **Provenance test (plan step 25) written by me**, `test/weather-provenance.test.ts`. Four
    tests, and deliberately **non-vacuous**: the first proves `WeatherState`/`WeatherOverride`
    really DO serialize from a simulated world, so their absence from the artifact is a property
    of the journal-onto-scratch construction rather than of the components being invisible. The
    other three assert the demo artifact carries neither, and that leaking either into the live
    edit world makes `save()` throw — pinned to the real message, `/replay-diff tripwire/`
    ("the replayed journal disagrees with the live edit world"), verified by first asserting a
    deliberately non-matching pattern and reading the actual thrown text.

## Rain + leaves (`6c2407d`), climate tuning (`d92b349`), fallback test (`3081e7b`). 1113 pass / 161 files

45. **REAL DEFECT FOUND AND FIXED: the VFX core wired tile collision to `mergedSolidCells`, the
    SOLID merge, not rain-blocking — and the `rainHeightAt` shelter hook was absent entirely.**
    That is a straight violation of the amended VFX contract (its three named weather hooks).
    Minimal engine fix: `mergedRainBlockingCells(ecs)` added to `occupancy.ts`; `vfx-def.ts`
    `collision` gains one authored key `cells: "solid" | "rain-blocking"` (default `"solid"`, so
    nothing else changes); `vfx-update-system.ts` picks the merge per classification and gained
    `cullSheltered`/`sheltered()` consulting `exposureField(ecs).rainHeight(gx)` at spawn, after
    seed-by-age, and per frame. Sheltered particles are `kill`ed not `die`d so no splash fires
    under an eave. `ExposureField` resolved once per frame, never per particle.
    Camera-cut pre-warm added (`detectCameraCut`, >half-viewport jump rebuilds camera-band defs).

46. **I REPLACED the effects worker's visibility hack.** It had authored a permanent
    `WeatherOverride{presetId:"storm", owner:null}` entity into `demo.scene.json` so rain showed
    immediately. That masks the scheduler entirely and pins strange content in the demo level.
    Instead I applied the plan's OWN stated mitigation ("the demo climate should be tuned punchy
    (short dwells)"): removed the override entity, set `temperate.defaultPreset` to `drizzle`, and
    shortened all dwells from 15-50 s to **8-20 s**. Result: the editor edit world (no scheduler,
    falls back to `defaultPreset`) shows drizzle immediately; the running game seeds at drizzle and
    the scheduler visibly rolls weather within a short session; `storm` stays reachable by weight
    and is one click away in the preview popover. Strictly better on all three counts.

47. **Plan step 25's wording is over-broad and I corrected my test, not the code.** It says assert
    the artifact contains no `WeatherState`/`WeatherOverride` — but `WeatherOverrideComponent` is
    deliberately authorable (`owner: null` = "an authored override that lives as long as its
    scene", per its own JSDoc). So an authored override in a scene file is legal by design. The
    real guarantee is that _runtime_ weather state cannot reach an authored artifact. Test now
    asserts: no `WeatherState` in the demo artifact, and neither type in a scene that authors no
    weather. The two tripwire tests are unchanged.

48. **Added `test/weather-edit-world.test.ts`** — no test covered the plan's step-9 edit-world
    fallback (no `WeatherStateComponent` -> resolved climate's `defaultPreset` targets), which is
    exactly the path decision 46 relies on to make weather visible while authoring. Asserted
    against the **shipped** catalog on purpose, so a future dry default preset fails CI rather
    than silently making the feature look broken on first launch. Verified it bites: reverting
    `defaultPreset` to `calm` fails 3 of its 4 tests.

49. Effects details: **1 of 4 render slots used** — rain, splash and both leaf parts all draw into
    `overlay#0` (overlay not foreground, because the `terrain` band sorts above `foreground` and
    would occlude resting leaves). Three slots left for blood/beam/fire.
    Ground marks skipped (landed schema has no decal spec) — rested leaves hold position and
    alpha-fade. Known core wart reported not fixed: `onDeath` fires on lifetime expiry as well as
    collision, so rain's lifetime is authored long enough (1.0-1.4 s) that expiry lands below the
    viewport; the right fix is a core expired-vs-collided distinction.
    Shelter gate is keyed on `collision.cells === "rain-blocking"` — one authored flag means "this
    part is precipitation" and buys both the classified merge and sky-reached-column confinement.
    `game-composition-boot`/`run-contamination` tests hand-reproduce `registrations.ts` and were
    missing the climate registration; they now call `registerClimateContent()`.

## API-shape pass

Reviewed the integrated surface (92 files, ~12.7k lines, 9 authors). 14 behaviour-preserving
findings applied; 2 deliberately deferred.

Applied: collapse `WeatherFrame` onto `EffectiveWeather` and delete its dead `gust` field (whose
doc comment was actively FALSE — it said audio needn't resample, but audio must, because the
frame's gust was built from indoor-masked `visibleWind`); dedupe `clamp01` (x2), the
exponential-approach helper (x2 -> new `engine/approach.ts` primitive), the "is scene indoors"
reader (x2), the `[0,1)`-from-hash idiom + duplicate `UNIT` (x3 sites); invert the three VFX
unions to `as const`-derived (they were hand-written union + hand-typed array, so adding a member
to one only still compiled) and make `render/blend.ts` the single source of `QUAD_BLENDS`; drop
two provably-redundant components from the exposure cache signature and hoist one
`tileLayerSignature` shared by 3 call sites; make the VFX store a REQUIRED ctor param on both
systems (the default `new VfxStore()` was an escape hatch that silently produced exactly the bug
both files' docs warn about, and had no caller); un-export/delete ~16 dead exports incl.
`disposeExposureField` which had no caller at all; stop `effectiveWeather` redoing all six queries
`weatherTargets` just did; export the tile cell-key builder instead of duplicating its format
across a module boundary; reduce `EmitterComponent`'s 4-arg ctor; one `DEG_TO_RAD`;
`attachedEffect` returns `null` like the rest of both slices.

DEFERRED (reported, not applied):

- The two seeded-PRNG owners take incompatible seed shapes (`seed?: () => number` on the weather
  scheduler vs `seed?: number` on the VFX store). Aligning them moves when the `Math.random()`
  draw happens = a behaviour change, so out of scope for a cleanup pass.
- `engine/animation/timeline.ts` has **no production consumer yet** (only its own test). `Ease` and
  `Keyframes*` ARE consumed by the VFX def/render path. Left in place deliberately: it is
  groundwork for the deferred `Tween`/`FadeTimeline` migration. Noting it so it stays a conscious
  choice rather than a surprise.

Came back clean: units (seconds throughout, radians internally with the degrees conversion
confined to the JSON parser, tiles-vs-world named in every crossing identifier); throw-vs-null
convention (all three registries throw with a known-keys list, all "is there one?" accessors
return null); mutable state (confined to the particle hot loop's typed arrays and the render
system's scratch arrays, everything else readonly); zero TODO/FIXME/HACK in the new surface; the
four WeakMap-keyed-by-ECS stores each have genuinely different read semantics so a shared helper
would be indirection with no saving.

Cleanup landed as `d58167e`: 26 files, +227/-245 (net -18 lines), 1113 pass / 161 files —
identical test count, so behaviour is preserved. `bun run build` green. New primitive
`src/engine/approach.ts`. All 14 items applied, none skipped.

One sub-ULP arithmetic note from the cleanup: the VFX rotation-TRACK parser was
`(deg * Math.PI) / 180` and now multiplies by a precomputed `DEG_TO_RAD`, which can differ by one
ULP. `degreesRange` already used the precomputed form, so the two sites previously disagreed with
each other. No authored def uses a rotation track (leaves.vfx.json uses the rotation _range_,
already on the precomputed path) and no test asserts track radians, so nothing observable moves.

Deliberate asymmetry left in place: `effectiveWeather` hard-masks visuals off `sceneIndoor` while
`exposureAt` soft-clamps to `INDOOR_OPENNESS_CEILING = 0.2` for the same flag. Both intentional
per their docs (visuals still, audio muffles); the cleanup unified only the _query_, not the policy.

## FINAL STATE

Branch `feature/2026-07-21-weather-system`, 20 checkpoints, 95 files, +12722/-102.
`bun check`: 1113 pass / 0 fail / 161 files. `bun run build`: green.
Stash to restore afterwards: "entity-placement-todo (pre-weather-impl)".
