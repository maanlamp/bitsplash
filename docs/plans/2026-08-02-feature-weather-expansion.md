# Weather expansion: storms, lightning, skies, and audio foundations

- **Type:** feature
- **Date:** 2026-08-02
- **Status:** accepted

## Goal

Storms that read as storms: heavy rain, hard wind, visible wind lines, foliage that
bends more at the crown than the trunk and rustles as it does, a sky that darkens,
and lightning with thunder placed by distance — plus snow and sandstorms as
first-class weather alongside rain, and a desert scene to author them against.
Underneath it, the audio foundations the weather system has been missing — a real bus
tree, immediate focus gating, and player-facing settings — plus fixes for two measured
defects in the shipped weather audio.

## Context & problem

The weather system shipped in July 2026 (`docs/notes/weather-decisions.md`) and its
audio was explicitly interim. Five things are now blocking:

**The ambience pumps.** Reproduced outside the game and localised: `playLoop` writes
every parameter every frame with `cancelAndHoldAtTime` followed by
`linearRampToValueAtTime`, and re-arms two future-scheduled `silenceAfter` events per
voice on top. A linear ramp that is replaced before it lands never resolves, and the
event list is rewritten every 16 ms. Roughly 1,200 AudioParam events per second.

**Weather never settles.** `DEFAULT_TAU = 8 s` against dwells of 8–20 s means the
eased scalars are re-aimed before they arrive. Measured against the shipped catalog:
rain is within 0.02 of its target on **9.2%** of frames for `storm-coast` and 32.8%
for `temperate`. At the pre-#46 dwells of 15–50 s it was ~70%. Shortening the dwells
to make weather visibly roll left tau untouched.

**Storms have no headroom.** `storm` is already wind 0.9 / precipitation 0.95, and
both scalars are `0..1` end to end. VFX rate scaling is
`lerp(1, visiblePrecipitation, influence)`, which can never exceed the authored base
rate, and `clamp01(wind * gust)` saturates at a gale so gusts only modulate downward.

**Focus gating is delayed and window-scoped.** `window-focus.ts` listens on the hub
`window` only; satellite editor windows are separate realms with their own rAF loops
(`use-satellite-windows.ts`), so a satellite's blur is invisible. The perceived
"delay" is `AMBIENCE_STALE_SECONDS = 2` doing double duty as a focus mechanism. Its
stated rationale — that panel focus would be too twitchy — does not hold:
`app.tsx` gates stepping on `wl.focused`, a layout-level view id that does not move
when a toolbar button or inspector field takes DOM focus.

**There are no player settings at all.** The pause menu is Resume/Save/Load/Quit.
No volume, no accessibility, no weather quality.

Constraints that bound the solution:

- **Serialization provenance** (AGENTS.md): ambient run-state must be structurally
  invisible to `serializeWorld`, not filtered out. Anything that creates or destroys
  entities in the editor's live edit world trips the save tripwire.
- **VFX run-state is deliberately non-restorable** and lives in instance-owned typed
  arrays. Ribbons join that model; nothing gains a serialized pool.
- **`VFX_MAX_RENDER_SLOTS = 4`**, and every distinct `(layer, order)` owns a
  full-viewport render target per frame. Today exactly one slot is used: rain, splash
  and both leaf parts all draw into `overlay#0`.
- **Rendering vocabulary is fixed** and sampling is `NEAREST` everywhere with no
  anti-aliasing, ever.
- **No save or scene migrations** pre-ship; a breaking schema change should crash
  loudly. Authored-content migration (one `clearColor` field) remains legitimate.
- **Audio cannot be verified by an agent.** Every sonic acceptance is the user's.

## Decision

Ten decisions, each settled during planning rather than deferred.

**1. A real bus tree, with user gain and system gain separated.**

```
destination
└─ master:  userGain → systemGain          ← window focus, master volume
   ├─ editor main:  userGain → systemGain
   │  ├─ scene view bus (one per view)     ← per-view mute; audio-focus owner gate
   │  └─ asset preview bus                 ← audio editor; never gated by a scene view
   └─ game:  ambience · sfx · voice        ← each userGain → systemGain
```

Settings write `userGain` only. Focus, pause and ducking write `systemGain` only.
Nothing system-driven ever mutates a value the player chose. There is no Music
category: the project has no music, so a Music control would control nothing.

Two properties come with the tree. **A world owns a bus**, disposed in
`World.dispose`, so a loop dies with its world by construction rather than by a
timeout — which is what lets the process-wide singleton go. And **`AudioManager` gets
a null implementation** selected when `AudioContext` is absent, so
`webAudioAvailable` stops being a structural gate every system must remember to
check, and the bus tree and focus derivation become assertable headlessly. That
second one matters disproportionately: everything else in this workstream can only be
judged by ear, so the parts that are pure logic should be judged by a test.

**2. The weather voices use `setTargetAtTime` and nothing else.** This is an
invariant, not a preference. No `cancelAndHoldAtTime`, no
`linearRampToValueAtTime`, no `setValueAtTime`, nothing scheduled in the future, on
any parameter written per frame. `silenceAfter` is **deleted** rather than
rate-limited: the spike showed the scheduled `setValueAtTime` + ramp pair reintroduces
pumping at 4 Hz re-arm just as it does at 60 Hz, because `setValueAtTime` terminates
the in-flight `setTargetAtTime` and nothing cancels the previous pairs. Slow fades and
residual cleanup live on the buses, which are written only on state change and are
therefore one-shot by construction.

**3. Audio focus ownership is derived, not claimed.** One module computes "who may
sound right now" from realm focus, the workspace layout's focused view, run state and
pause; the buses subscribe. Call sites do not claim or release. This matters because
deleting `silenceAfter` inverts the failure mode — previously anything that stopped
pushing went quiet in 2 s, and afterwards a missed release would sustain ambience
forever. Deriving it removes the class of bug rather than the instances. Focus
listeners are installed **per realm**, so satellites and the popout window gate
correctly and weather-decisions #33 (two windows fighting over one graph) is resolved.
Blur mutes the game; it does not pause it.

**4. `0..1` weather scalars stay blend weights; the absolute lives in the effect
def.** Storm headroom comes from retuning bases so `1.0` means a genuine downpour,
and from heavier presets selecting heavier defs — the two halves prior art uses
together. `tau` drops so the eased scalars actually arrive within a dwell.

**5. Precipitation becomes named channels.** `rain`, `snow`, `sand`, with `wind` as a
peer channel, each `0..1`. Consumers ask per channel, which is the reason Ultra
Dynamic Weather does it this way — "how snowed-on is this entity" is a different
question from "how rained-on", and one scalar cannot answer both. Exposure gains a
per-channel query.

**6. The sky becomes a component.** `scene.config.clearColor` is removed; a
`SkyComponent` holds the authored colour (defaulting to the demo's current blue) and
the weather resolves a per-frame tint over it. Solid colour only — gradients and
parallax bands are deliberately out of scope, and the component is shaped to grow
into them.

**7. Foliage sway becomes a shader program.** A quad has four corners, so its shear
is linear by construction; "less low, more high" is unreachable from the current
primitive. Displacement happens in the **fragment** stage — the vertex stage cannot
be non-linear with four vertices — by inverting the bend per output texel to find its
source UV. Every input is a `FoliageSwayComponent` field, so the profile is tunable
per sprite without any authored mask. This is the sixth program of an existing kind
(five already link, four sharing `WORLD_VS`, two carrying their own uniforms) and it
uses the existing `drawImmediateQuad` path that the conic outline already uses for
per-draw uniforms.

**8. One `ribbon` part kind, with the path generator as the only difference.**

| Effect         | Path generator                                    |
| -------------- | ------------------------------------------------- |
| Wind line      | wandering value noise, advected by the wind field |
| Lightning bolt | midpoint displacement with probabilistic forks    |
| Loot beam      | vertical, fixed length, pulse on width and alpha  |
| Epic helix     | helical orbit around an axis                      |

This **replaces** the VFX plan's separate "beam-quad parts" (that plan's WS-C step 11)
with a single kind — the same consolidation Epic made, whose docs state plainly that
"beams are simply ribbons with specific logic, as a separate beams renderer doesn't
exist". `vfx-def.ts` already lists beam-quad parts under _Deliberately absent — the
schema is shaped to grow into them_, with `kind` as the discriminant.

**9. Lightning is world-anchored and published as an event.** Strikes resolve a ground
point through the exposure field's existing `rainHeightAt`, so bolts land on real
geometry and thunder gets an honest distance. Each strike publishes a world event
carrying impact position, intensity and time; the bolt renderer, the flash, the impact
burst and thunder are all consumers. Damage is not in scope, and because the event is
the seam it stays a game-layer subscriber later with no engine change.

**10. Thunder is a sampled bank, layered by distance.** Synthesis was spiked twice —
once as a physically-motivated multi-source model and once as a faithful rebuild of
the best-rated published model (AES 152 / Nemisindo) — and rejected both times. The
bank uses distance-banded layer selection with edge crossfades, which is the
arrangement that passed.

## Alternatives considered

**Focus gating at each source instead of the bus.** Precise, and it arbitrates the
two-window fight, but every future sound has to remember to consult it — the
discipline-based design AGENTS.md says to make structural instead. The bus plus a
derived owner does both jobs with one mechanism each.

**Uncapping the weather scalars, or adding a second unbounded intensity knob.**
Neither appears in any system surveyed. Skyrim's precipitation density is `0.0–1.0`,
Valheim's wind is `0.05–1`, Ultra Dynamic Weather's exposure query returns per-channel
floats in `0..1`. The scalar is a blend weight and blend weights that exceed 1 stop
composing.

**Defs self-selecting into weather by matching a tag.** No prior art at all — the
weather tells effects what to do, not the reverse — and it leaves every precipitation
def resident in every scene, so a desert level allocates snow's pool.

**Presets naming their effect ids** (Valheim's and Skyrim's shape). Viable, but it
makes something own spawning and despawning emitters across preset rollover,
save/restore and the edit world, where an entity the save tripwire can see is a
hazard. Channels keep emitters as authored residents and gate them numerically.

**Authored wind-weight masks for sway** (the roadmap's parked design). The industry
technique, and genuinely more expressive — it can make one branch behave unlike its
neighbours. Rejected for now because it needs a sprite-editor painting surface, a
`.bsprite` schema change, and every foliage sprite hand-painted before anything moves,
while per-sprite shader uniforms deliver the tunability that was actually wanted.
The mask remains a compatible upgrade.

**Chained particles for ribbons.** A ribbon is not a train of dots; you get beads
unless the quads overlap densely, which multiplies particle counts, and taper and
continuity become approximations rather than properties.

**A gradient or parallax skybox.** Both subsume the solid colour, and the parallax
version is what a 2D platformer sky eventually wants. Out of scope deliberately:
neither is needed to darken a sky, and the band version needs cloud art that does not
exist.

**Synthesized thunder.** Rejected after two spikes. The published listening test
(50+ participants) found even the best synthesised model still plainly distinguishable
from a recording, and their own write-up says of the field that "none of the methods
sound very close to the real thing". Sub-bass synthesis under a recorded crack was
also tried and rejected — it reads as two stacked things rather than one event.

**Rate-limiting `silenceAfter` instead of deleting it.** Measured: still pumps at
4 Hz re-arm. Not a rate problem.

## Approach / steps

Eight workstreams. **A and B are the shared foundations and land first**; the contracts
they publish are listed with them. C, D, H can then run in parallel; E needs D; F needs
A, B, D, E; G needs B, E.

### WS-A — Audio foundations (`src/engine/audio/`)

Publishes: the bus handle type, `audioFocus` subscription API, the settings store
shape.

1. Add a bus tree to `AudioManager`. A bus is a `userGain → systemGain` pair with a
   parent; `createBus(parent?)` returns a handle exposing `setUserGain`,
   `setSystemGain`, `mute`, `dispose`. `ctx` stays private. Existing `playBuffer`,
   `play` and the voice-bank path keep working by defaulting to the master bus, so no
   call site changes.
2. Rewrite `playLoop`'s parameter writes to `setTargetAtTime` only, and **delete
   `silenceAfter`** and its dead-man's-switch documentation. `LoopVoiceHandle` becomes
   `{ set, stop }` and gains a `bus` option.
   ⚠ Checkpoint: this is the fix for the reported pumping and the one place a
   regression is unacceptable. The A/B harness built during planning is the
   verification: modes "as shipped", "drop cancelAndHold" and "don't re-arm" all pump;
   "setTargetAtTime" and "static" are clean. Re-run that comparison against the real
   engine graph after the change, and if any future-scheduled event appears on a
   per-frame param, the change is wrong.
3. New `engine/audio/audio-focus.ts`: computes the current audio owner from realm
   focus, the host's focused view, run state and pause, and notifies subscribers on
   change. Focus listeners install **per realm** (`Window`), not once on the hub.
   Nothing claims or releases; owners are derived. Residual cleanup — one
   `setValueAtTime(0)` at ~5τ after a mute — lives here, on buses only.
4. Wire `Game.setPaused` to publish a focus change. It is currently a bare flag that
   nothing observes, and pause silence previously worked only as a side effect of the
   deleted dead-man's switch.
5. New shared settings store (engine-level, `localStorage`-backed, `Subscribable` like
   `editorSettings`): master/ambience/sfx/voice volumes, accessibility flags, weather
   quality. Volume position maps to gain as `position ** 1.67` — Stevens' power law
   gives `loudness ∝ amplitude^0.6`, so this makes loudness linear in slider position
   and puts 50% at −10 dB, the established half-as-loud figure. 100% is unity.
6. **World-scoped audio lifecycle.** `World.dispose()` disposes physics and nothing
   else, which is the only reason the ambience graph is manager-scoped rather than
   world-scoped. Give a world its own bus, disposed in `World.dispose`, so loops die
   with their world by construction. This removes the last justification for the
   process-wide singleton that the deleted dead-man's switch existed to compensate for,
   and with it weather-decisions #22's "five voices created once per `AudioManager` and
   never stopped, idling at zero gain for the process lifetime".
7. **A null audio backend.** Extract the surface `AudioManager` exposes into an
   interface and add a no-op implementation selected when `AudioContext` is absent.
   `availability.ts`'s docstring currently ends "which is why no ambient system needs a
   `try`/`catch` or a null backend" — that sentence goes, and `webAudioAvailable` stops
   being a structural gate systems must remember to check. The payoff is testability:
   the bus tree and the focus derivation become assertable headlessly, which matters
   because everything else in this workstream is verifiable only by ear.
8. Reconcile the three existing audio test stand-ins, all of which the bus work will
   hit: `test/support/sequence-harness.ts:184` supplies `audio` as a **throwing Proxy**
   (`stubService`), and `test/game-composition-boot.test.ts:103` and
   `test/run-contamination.test.ts:134` each hand-roll
   `{ … } as unknown as AudioManager`, duplicated rather than shared. Replace all three
   with the null backend from step 7 — one real implementation instead of three
   fictions, and the harness stops throwing on property access.
9. Delete `weather-ambience.ts`'s focus hooking and `WeatherAmbience.duck`; the graph
   now takes a bus and pushes parameters only.
10. Rewrite `editor/weather/silence-weather-audio.ts` away: a muted scene view mutes
    its own bus instead of pushing a silent mix.

### WS-B — Weather channels and easing (`src/engine/weather/`)

Publishes: `WeatherChannels`, the amended `EffectiveWeather`, per-channel exposure.

11. `WEATHER_CHANNELS = ["rain", "snow", "sand"] as const` with `wind` as a peer
    scalar, following the `CLIMATE_IDS` type-safe-cross-reference pattern.
    `ClimatePreset`, `WeatherRequest`, `WeatherStateComponent`, `EffectiveWeather` and
    `WeatherTargets` all move from one `precipitation` number to a channel record.
    A preset that omits a channel means zero, so rain→snow crossfades by construction.
12. Fix the easing. `DEFAULT_TAU = 8` against 8–20 s dwells is why rain is on target
    9.2% of frames on `storm-coast`. Lower tau so a scalar substantially arrives within
    the shortest dwell, and assert the relationship at catalog-validation time so a
    future dwell shortening cannot silently reintroduce it.
    ⚠ Checkpoint: tau and dwell are coupled and the right value is a feel judgement.
    The measurement harness from planning reports on-target percentage per climate;
    target is comfortably above 60% while weather still visibly rolls. If a tau short
    enough to settle makes transitions feel abrupt, the fallback is lengthening dwells
    instead — the same coupling from the other side.
13. Decouple the gust from saturation. `clamp01(wind * gust)` plateaus at a gale, so
    gusts can only modulate downward there and a storm's wind bed dips rather than
    surges. Normalise against the envelope ceiling instead of clamping, so gusting
    stays symmetric at full wind.
    ⚠ Checkpoint: the same measurement shows the wind voices swinging up to
    **19.4 dB at 0.50 Hz** (`blustery`), and I do not know whether that reads as
    weather or as a mechanical throb — it is not the fault reported, which is faster
    and irregular. Present the measurement, change the depth only on the user's ear.
    Reducing it unasked would be trading away gust character to fix something that
    may not be broken.
14. Per-channel exposure: `exposureAt` gains a channel parameter so sand and snow can
    weight shelter differently from rain. `rainHeightAt` and `mergedRainBlockingCells`
    generalise to a channel's blocking classification, keeping `"rain-blocking"` as
    the existing authored value.
15. `weatherAudioMix` reads channels. Rain keeps its light/heavy crossfade; snow
    contributes almost nothing (falling snow is near-silent, which is the point) and
    sand contributes a hiss bed plus a mid band.
16. Update the tests this workstream moves: `test/weather-edit-world.test.ts` asserts
    against the shipped catalog's `defaultPreset` deliberately, so new presets and any
    dwell change land there; `test/weather-provenance.test.ts` covers
    `WeatherStateComponent`, whose schema changes with channels. Both are tripwires
    worth keeping — update them, do not weaken them.

### WS-C — Sky (`src/engine/sky/`)

17. `SkyComponent` — authored `Color`, `@serializable("Sky")`. A render system draws
    it as a full-viewport quad into the `background` layer, with a per-frame tint
    resolved from the weather channels (rain darkens, sand goes ochre, snow flattens
    toward white).
18. Remove `clearColor` from `SceneConfig` and from `renderSceneToTexture`, which uses
    it for **both** the world and the UI pass — both need handling. A scene with no
    `SkyComponent` clears transparent, which is what `clearColor`'s default
    (`Color("transparent")`) does today, so an interior or a UI-only scene is unchanged.
    Migrate the one authored value in `demo.scene.json`
    (`oklch(0.752 0.1204 204.04 / 1)`) onto a `SkyComponent`, and update the
    byte-compare baseline in `test/scene-document-save.test.ts` to exactly what the
    editor now writes.

### WS-D — Renderer primitives (`src/engine/render/`)

Publishes: the sway program, the ribbon draw helper.

19. A sway program: `WORLD_VS` plus a fragment shader that inverses the bend per texel.
    Uniforms for amplitude, curve exponent, rustle amount, rustle frequency, phase,
    pinned edge and time. Draw through the existing `drawImmediateQuad` path. The quad
    must be expanded to cover where the bent sprite lands or the lean clips at the
    edge — the same trick `RING_PAD` already does for outlines.
    ⚠ Checkpoint: unverifiable until built. `NEAREST` sampling with no AA means the
    warp quantizes to whole texels per row, and those boundaries will crawl as the
    lean changes. That is plausibly the correct pixel-art look, but if it reads as
    stair-step crawling the fallback is quantizing the profile itself into N discrete
    row bands via `quantizeToTexel`, so the steps are stable per lean value instead of
    per texel.
20. A ribbon helper over `drawCornerQuad`: takes a polyline, a width profile along arc
    length, tint/alpha over arc length and a blend, and emits the quad chain. Shared
    by every path generator; no VFX knowledge.

### WS-E — VFX ribbon part kind (`src/engine/vfx/`)

21. Extend the `VfxPart` union with `kind: "ribbon"`: path generator and its
    parameters, `segments`, length range, width profile, taper, tracks, blend,
    `(layer, order)`, weather channel influence. Validation rejects unknown keys as
    the emitter parser does; ribbons opt out of `capacity` derivation, collision and
    spawn shapes, which are particle concepts.
22. Ribbon instances live in the instance-owned `VfxStore` alongside particle pools, so
    they inherit the non-restorable-run-state property and seed-by-age on thaw.
23. Allocate the render slots explicitly, because the catalog-wide cap of 4 is exactly
    consumed by this plan and the VFX plan still owes blood and fire:

    | Slot         | Contents                                            |
    | ------------ | --------------------------------------------------- |
    | `overlay#0`  | rain, splash, leaves, snow, sand (existing, shared) |
    | `overlay#1`  | wind-line ribbons                                   |
    | `overlay#2`  | lightning bolt + additive glow                      |
    | `entities#0` | loot beam, Epic helix                               |

    ⚠ Checkpoint: that is 4 of 4. If blood or fire needs a fifth, the options are
    sharing a slot and relying on submission order within it, or raising
    `VFX_MAX_RENDER_SLOTS` with a measured VRAM and fill cost — decide then, with the
    real frame cost in hand, not now.

### WS-F — Lightning and thunder

24. `engine/weather/lightning.ts`: midpoint displacement — subdivide, offset the
    midpoint along the segment normal, halve the offset each generation, fork at a
    subdivision point with probability _p_ into a shorter, dimmer child. Pure and
    seeded, so a bolt is reproducible from its strike event.
25. Lightning frequency is its own authored preset field, `lightning` in strikes per
    minute — not derived from a channel. Lightning is not precipitation and does not
    track it: a dry thunderstorm and a rain shower with no lightning are both real
    weather, and deriving the rate from `rain` would make either unauthorable. `storm`
    gets a high rate, `drizzle` zero.
26. A strike scheduler driven by that rate. **All state is WeakMap-keyed by ECS** like
    the ambient clock — it must not create or destroy entities, which would trip the
    save tripwire in the edit world. Strike position resolves through `rainHeightAt`,
    so bolts only land in sky-reached columns.
27. Publish a strike as a world event: impact position, intensity, seed, time.
    Consumers: the ribbon renderer (bolt), the flash, the impact burst, thunder.
28. The flash is a screen-space overlay on the `engine/fade` path, **not** a VFX part —
    it consumes no render slot. It respects the accessibility guidance as a hard floor
    regardless of setting: no more than three flashes per second, flash area under ~20%
    of the screen, fade rather than hard on/off, no high-contrast white-on-black. The
    accessibility setting scales intensity within that envelope. The per-second cap is
    enforced at the scheduler, so a high `lightning` rate thins strikes rather than
    stacking flashes.
29. Thunder bank. Add the takes **as-is, untouched**, under
    `src/game/content/assets/` — 96 kHz/24-bit sources; compression is a Vite plugin
    and out of scope for this plan. Record the licence beside them: Sonniss GDC bundle,
    royalty-free, commercial use, unlimited projects, no attribution required, no
    AI/ML training use. **Only the eleven banked takes below go in.** The trailer
    booms, sub-sonic bass hits and the 3-minute distant-storm ambience were auditioned
    and rejected; `close-insj-very-close-rain-03` is excluded because it has rain baked
    into the take, which is the thing the bank exists to avoid. The names below are the
    source names; on import they take project-convention names, and the bank is reached
    from code through an `as const` id tuple validated at load — a bare string literal
    naming a take is exactly the magic cross-reference AGENTS.md forbids.

    | File                                  | Role           | Strike at       |
    | ------------------------------------- | -------------- | --------------- |
    | `sr-thunder_strike_03`                | close          | 0.75 s, 2.95 s  |
    | `sr-thunder_mountainous_big_crack_02` | close          | 0.0 s           |
    | `close-insj-extremely-close-03`       | crack, ≤400 m  | 1.20 s          |
    | `close-soundholder-short-dry`         | crack, ≤3.5 km | 4.80 s, 11.95 s |
    | `sfx-Thunder_Crack_Fienup_016`        | crack, ≤3 km   | 7.45 s          |
    | `sfx-Thunder_Boom_Fienup_005`         | crack, ≤2.5 km | 0.0 s           |
    | `sr-thunder_clap_04`                  | crack, ≥400 m  | 0.0 s           |
    | `close-insj-distant-01`               | crack, ≥3 km   | 1.75 s          |
    | `sr-thunder_mountainous_distant_03`   | crack, ≥2.5 km | 0.0 s           |
    | `sfx-Thunder_Rumble_Mid_Fienup_024`   | rumble, ≤2 km  | 0.0 s           |
    | `sfx-Thunder_Rumble_Deep_Fienup_003`  | rumble         | 2.0 s           |

30. Thunder placement, with the band rules that passed audition: the close layer is at
    full weight to **60 m** and gone by **160 m**, picking randomly between its two
    takes; the crack layer ducks to `1 - closeWeight * 0.55` and lands **25 ms** behind
    when the close layer is engaged; the rumble offset is `90 ms + 260 ms/km` with
    weight `0.3 + 0.7 * min(1, d / 2500)`. Distance drives the arrival delay
    (`d / 343`), an air-absorption lowpass (`22000 * e^(-d/3000)`, floored at 140 Hz),
    level falloff (`700 / (d + 700)`), and pan toward the bolt. Every take is
    preloaded through `load()` and played via `playBuffer` on the sfx bus —
    `AudioManager.play()` is documented silent on first play of any URL and must not
    be used.

### WS-G — Effects content and tuning (`src/game/`)

31. Retune rain so `1.0` is a genuine downpour, and author a heavier storm rain def
    that the storm preset selects. Raise sway amplitude and wind influence to match.
    ⚠ Checkpoint: higher base rates grow the derived pool capacities, snow and sand
    add their own, and `camera-band` scales with viewport. If frame cost regresses,
    the weather-quality setting is the release valve — honour it at the emitter, as
    the roadmap specifies.
32. `snow.vfx.json` (slow, high drag, drifting, `snow` channel) and
    `sand.vfx.json` (fast, near-horizontal, wind-driven, `sand` channel).
33. `wind-lines.vfx.json` — ribbon parts on the `wind` channel, count and opacity
    rising with wind so they are absent in a breeze and prominent in a gale.
34. New presets and climates: `blizzard`, `sandstorm`, plus `alpine` and `desert`
    climates. Cross-check ids against `WEATHER_PRESET_IDS` / `CLIMATE_IDS` as the
    catalog loader already does.
35. A desert test scene: new `*.scene.json` on `sand.tileset.png` with a `desert`
    `SceneClimate` and a `SkyComponent`, so sand, sky tint and wind lines are
    authorable and observable without touching the demo scene.

### WS-H — Settings surfaces

36. A tabbed settings view in `src/game/ui/`, reachable from both the main menu and the
    pause menu. Tabs: Audio, Video, Accessibility, Controls. Audio carries the four
    volume sliders on the `position ** 1.67` curve.
37. Accessibility tab: lightning flash intensity, camera shake (`CameraShakeSystem`
    exists), weather particle density, screen fades, weather quality. Defaults favour
    the better-looking game.
38. A first-launch accessibility pass the player walks through, changing or explicitly
    skipping each item before play, with a persisted "seen" flag. This is how consent
    is obtained before exposure without a dismissable health modal.
39. Editor: per-scene-view mute toggle driving that view's bus, persisted with the view
    through `workspace/persist.ts`. The asset-preview bus is never affected — the audio
    editor must keep sounding while a scene view is muted or unfocused.
40. Rewrite the AGENTS.md slider rule. The ban belongs to values where precision is
    load-bearing — aim sensitivity, input timings, thresholds — not to values where
    coarse resolution is genuinely fine. Volume and weather quality are sliders;
    sensitivity stays a raw number with a unit and a preview.

### Documentation — done at planning time, not left as a step

The doc surgery this plan supersedes was applied when the plan was accepted rather than
deferred to implementation, so nothing here is owed:

- `docs/notes/contracts-phase2.md` **deleted** — a build contract for a session that
  recorded FINAL STATE; no consumers remain.
- `docs/notes/notes-audio.md` **deleted** — it existed to feed an audio-foundations
  planning session, and this is that session's output. Its three still-live facts (the
  harness Proxy and two hand-rolled stubs) moved into WS-A step 8.
- `docs/notes/weather-decisions.md` **trimmed** of its superseded audio sections,
  keeping the ~44 decisions that remain the live rationale behind shipped code.
- `docs/roadmap.md` — audio foundations, weather quality toggle, sky/light tint and
  "swirly wind line particles" removed. Foliage wind-weight masks stay: this plan makes
  them an upgrade rather than a prerequisite.
- `docs/plans/2026-07-20-feature-vfx-system.md` **amended**: beam-quad parts are
  replaced by the ribbon kind.

## Research findings that drove this

**Measured in the codebase during planning:**

- Wind voice gains swing up to **19.4 dB at exactly 0.50 Hz** (`blustery`), because
  gain rides `speed`, `speed²` and `speed³` off a 0.5 Hz fast-attack envelope. Rain
  gains modulate **0.0 dB** — they do not ride the gust at all.
- Rain is within 0.02 of its target on **9.2%** of frames (`storm-coast`) and 32.8%
  (`temperate`) against the shipped catalog; at the pre-#46 dwells it was ~70%.
- The 3 s noise loop's filtered envelope has under **1 dB** of slow structure, so the
  loop is not audible as a pattern. Confirmed independently by the user: the thunder
  spike used the same loops and was clean.
- The AudioParam automation is mathematically exact under ±8 ms frame jitter, 15%
  dropped frames and 40 ms context latency — **0.0 dB** of settled variation. The
  pumping is therefore not a timing-arithmetic problem; it is the churn itself.
- Five programs already link in `renderer-2d.ts`, four sharing `WORLD_VS`, two with
  their own uniforms, and `drawImmediateQuad` already exists for per-draw-uniform
  programs. A sway program is the sixth of an existing kind.
- All four existing VFX parts share `overlay#0`; one slot of four is used.
- `demo.scene.json` carries exactly one `clearColor`.
- `workspace/persist.ts` persists the multi-window workspace to `localStorage`.

**Prior art that changed a decision:**

- **Ribbon is a renderer type inside the effect system**, uniformly: Niagara's five
  renderers include Ribbon, Unity VFX Graph has Output Particle Strip Quad, Effekseer
  has Ribbon and Track nodes. Nobody chains sprites, nobody uses a separate subsystem
  for ambient ribbons. And Epic states outright that "beams are simply ribbons with
  specific logic, as a separate beams renderer doesn't exist" — which is why the loot
  beam and the bolt share one kind.
- **Weather scalars are normalized and the absolute lives in the asset.** Skyrim's
  precipitation density is `0.0–1.0` with the particle config defining `1.0`; Valheim's
  wind is `0.05–1`; Ultra Dynamic Weather's exposure query returns per-channel `0..1`
  floats scaling with both intensity and exposure. That last one is structurally what
  `exposureAt × scalar` already is, generalised — which is the argument for channels.
- **Foliage wind is three bands weighted by a height gradient** — trunk bend, branch
  sway, leaf flutter — which is exactly "more sway up high, and rustle as well as
  sway", and is why the profile is a height power curve plus a high-frequency term.
- **Thunder synthesis has a ceiling.** The AES 152 / Nemisindo model scored most
  realistic of the synthesised set in a 50+ participant listening test and remained
  distinguishable from a recording; the authors' own summary of the field is that none
  of the methods sound close. The frontier moved to neural filterbank synthesis
  (NoiseBandNet, 2023), which needs a trained model and is not shippable here.
- **Practitioner consensus is layer a recorded crack with a rumble**, using reverb and
  delay for distance — which is what the banded design does, with distance driving the
  filtering rather than a bucketed sample set.
- **Flashing limits are specific and non-negotiable**: no more than ~3 flashes/second,
  under ~20% of screen area, avoid high-contrast white-on-black, prefer fades
  (Xbox AG 118, Epilepsy Foundation). Roughly 1 in 4,000 people can seize from
  violating them.
- **Perceived loudness follows `amplitude^0.6`** (Stevens), giving `position ** 1.67`
  for a perceptually linear slider and −10 dB at 50%.
