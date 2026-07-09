# Configurable Input Bindings

- **Type:** feature
- **Date:** 2026-07-09
- **Status:** draft

## Goal

A first-class, fully configurable input system: the game defines **semantic
actions**, the player owns the **entire physical-input → action mapping**, and
every consumer reads resolved actions — never raw keys. Press vs hold vs toggle,
chords, references, and multi-device bindings are all independently configurable
per action; rebinding is live; bindings persist. Aiming is handled by a sibling
**axis-binding** family (angle-based). The system ships and works **before** the
in-game-UI rework, and becomes the action layer that rework consumes.

## Context & problem

**Today's binding is a flat string map.** `game/input-bindings.ts` is a nine-line
`{ action: "KEY" }` object (`interact: "E"`), keyboard-only, no press/hold
notion, no mouse/gamepad, not persisted.

**Consumption is immediate-mode polling with hand-rolled edge detection.** Every
consumer reads `input.keyboard.keys[InputBindings.x]` directly and re-implements
"just pressed" with its own prev-frame flag: `interaction-system.ts:21-23`
(`interactWasHeld`/`pressedThisFrame`), `player-intent-system.ts:43`
(`jumpWasHeld`), `dialogue-system.ts:360-368` (`navUpHeld`/`navDownHeld`). There
is **no engine-level edge detection** and **no "consumed" concept**. Dialogue
advance is consumed by a shared mutable field: `interaction-system` writes
`InteractionStateComponent.pressedThisFrame`, `dialogue-bindings.ts:20-25` reads
and clears it — an ordering-based handshake that must be preserved.

**The anti-pattern is live in the code.** `platformer.ts:142` wires cutscene
`skipHeld` to `InputBindings.interact` — skip *is* interact today. Cutscene skip
already implements hold-to-activate ad hoc with a hardcoded
`SKIP_HOLD_SECONDS = 0.6` (`cutscene-system.ts:10`).

**A clean seam already exists.** Engine systems that need input do **not** read
`InputBindings` — they take a `Bindings` object of predicate closures
`(ctx) => boolean` (`DialogueBindings` at `dialogue-system.ts:23-37`,
`CutsceneBindings` at `cutscene-system.ts:6-8`), and the *game* supplies them
(`platformer.ts:132,141-144`). This keeps Engine ignorant of game concepts and
is exactly where a binding system plugs in.

**Things the design assumes that do not exist yet** (all built here or noted as
prerequisites):

- **No action-map / edge detection / consumption** anywhere.
- **No crosshair or aim state.** Aim is a fresh angle every frame:
  `bow-system.ts:39` computes `(cursorWorld − owner).angle()`; nothing is stored
  between frames.
- **No fixed timestep.** `game.ts:83,92` is a variable-dt RAF loop; `dt` is raw,
  **unclamped** wall-clock ms, passed straight through (Rapier eats it too,
  `rapier-physics.ts:61`).
- **No settings persistence.** `game/settings.ts` is `export const UI_SCALE = 3;`.
  `@serializable` is ECS scene content only; `save.md` deliberately rejects
  `localStorage`/IndexedDB *for saves*.
- **Allocation already bleeds** in the aim path: `gamepad.update()` news a
  `Vector2` per stick/frame; `Camera2D.screenToWorld`/`worldToScreen` allocate
  per call; `bow-system` does a `screenToWorld` + several `.clone()` per frame.

**Layering (AGENTS.md, strict).** Engine ← Game, Engine ← Editor. Engine must
never import game/editor. The editor runs real game scenes and swaps the whole
`Input` object (`RunSession` holds `real` + `muted`, routed per mode) —
input reaches systems only via `UpdateContext.input`.

**Relationship to the in-game-UI plan** (`2026-07-09-feature-in-game-ui.md`).
That plan's §4 event layer, §4.4 masked-input, §4.5 frame slot, and §4.6 engine
edge detection overlap this work. This plan owns the **one** engine edge
primitive and token→action resolution; the UI plan consumes them and owns
token→UI-event normalization. This plan ships first and stands alone.

## Decision

Build a new engine slice **`engine/input/bindings/`** owning a retained,
data-driven **action-map** plus a sibling **axis-binding** family, resolved once
per frame and read by every consumer through a live action API. The spine:

1. **Actions are semantic outcomes** with one authored, intrinsic property:
   `discrete` (emits a one-frame *fired* pulse) or `continuous` (active/inactive
   state). Kind reflects *what signal the action emits* (what the consumer
   reads), never what input is allowed. Consumers read `actions.fired(id)` /
   `actions.active(id)` only — never raw keys, never their own edge detection.

2. **A binding is `activation(source)`, activation always explicit.**
   - `source` ∈ **physical token(s)** (device-qualified: `kbd:E`, `mouse:left`,
     `pad0:south`), a **chord** (`CTRL+B`), or a **`REF(actionId)`**.
   - `activation` for discrete ∈ `press | hold | doubleTap | repeat`; for
     continuous ∈ `whileHeld | toggle`. A `press` on a continuous action means
     `toggle`.
   - Bindings are **many-to-many**: one input may drive several actions, one
     action may have many bindings, any non-essential action may have zero.

3. **`REF` is a keys-only, live alias.** `REF(X)` resolves to X's **terminal
   physical sources** (its tokens/chords), ignoring X's activation; chains
   resolve transitively (`FF=HOLD(REF(ADVANCE))`, `ADVANCE=PRESS(REF(INTERACT))`,
   `INTERACT=PRESS(E)` → `FF=HOLD(E)`). There is **no** activation
   inheritance/override — you always write the activation. Default
   `dialogue.advance = PRESS(REF(interact))` so it follows interact's key live
   until the player breaks it.

4. **Expansion is a shared, memoized, cycle-and-dangle-checked pre-pass.** The
   resolver, conflict detector, essential-guard, and hint renderer all read the
   same expanded result. The **entire memo is nuked on any binding edit** (edits
   are cold; the memo serves the per-frame resolve hot path). Cycles are rejected
   **at edit time** (canonical DFS back-edge, `actionId`-ordered), with a
   resolve-time edge-drop backstop, re-validated on load.

5. **Two-scope resolver.** (1) Per physical token, decide once what the key *did*
   this frame (tap / crossed-hold-threshold / double / repeat), on shared
   engine-level edge detection. (2) Fan that decision out to every action bound to
   the token (direct or ref-expanded) as equal peers — `press` takes the
   down-edge, `whileHeld` the held-state; they never compete for one tap/hold
   decision.

6. **Consumption is token-level.** Consuming an action marks its expanded tokens
   consumed for the rest of the step, across actions/contexts — this reproduces
   today's `consumeAdvance` handshake without a shared mutable field, and ships
   now (independent of the UI mask, which is just an extra upstream filter added
   later). A `REF` and its target **contend** for the shared token; the canonical
   target has dispatch priority over a referrer, routed through a "linked" (not
   "conflicting") exemption so contention is detectable, not silent.

7. **Contexts + ordering.** Actions belong to contexts (`gameplay`, `dialogue`,
   `cutscene`, `menu`). The resolver runs per active context in a registered
   order (topmost consumes first). **Conflict detection and the can-coexist
   graph are scoped to the deferred rebind-UI phase** (no screens exist yet;
   freeze-behind is deferred). The now-phase registers contexts for *resolution
   ordering* only.

8. **One global hold threshold, player-configurable.** A hold is inherently
   deliberate, so a hold is accident-proof by nature; the single global duration
   is the accessibility/preference lever. No per-action thresholds, no
   hold-type distinction. Irreversible holds (skip) render a visible progress
   fill (presentation only, not a different timing). Global `doubleTap` window
   and `repeat` delay/rate are likewise single, player-tunable values. Discrete
   actions expose a per-step **fired count** so DAS/lag repeats aren't lost.

9. **Per-action activation is player-editable; hold↔toggle first-class.** Since
   activation is always explicit and "authorable by users," players set a
   binding's activation freely. Continuous actions expose a per-action
   `whileHeld↔toggle` flip (author default + player override), plus a global
   "convert all holds to toggle" bulk switch. Multi-binding continuous merge:
   `active = (any whileHeld down) OR (toggle latch)`. The toggle latch is
   per-(context, action), resets when the action's last binding is removed, and
   resets to default on save/load.

10. **Devices: keyboard + mouse + gamepad all resolved now**, on one shared
    engine edge primitive (prev/curr token snapshot). Auto-repeat/DAS is an
    activation owned here; the UI plan's normalizer consumes it, does not re-own
    it.

11. **Aim is a separate axis-binding family, angle-based.** Not a third action
    kind (it has no activation/consumption/`fired`/`active`; it answers
    `sample()`). Aim state is **one persistent angle** (`AimComponent`): a mouse
    source *sets* it from the cursor; a stick source *integrates angular
    velocity* into it; on device switch the incoming source **seeds from the
    current angle** (no teleport). Sensitivity is a **single scalar in rad/s**
    (no H/V split — there's one angle; cm/360 is dropped as an FPS category
    error). Axis bindings declare accepted source kinds; digital→axis and
    analog→button crossovers get explicit synthesis/threshold adapters (illegal
    combos are validated rejections, not silent no-ops).

12. **Active-device tracking is auto-only and exposes two signals.** An engine
    subsystem tracks device usage (`{mkb, gamepad}`) via
    most-recent-meaningful-input with **asymmetric hysteresis** (higher steal
    threshold + sustain, lower release; mouse "meaningful" = accumulated delta;
    switch-deadzone > aim-deadzone) and exposes **`promptDevice`** and
    **`aimOwner`** separately: `promptDevice` (drives glyphs) may flip on any
    input; `aimOwner` is sticky to the last device that produced *aim-axis* input
    — so moving with WASD flips glyphs but never yanks stick-aim to the idle
    cursor (kbd-move + stick-aim is a first-class hybrid). No manual lock.

13. **Ownership split via an opaque registration API.** Engine owns the
    *mechanism* only (resolver, activation kinds, `fired`/`active`/`consume`,
    axis sampling, `activeDevice`, `SettingsStore`) and stores everything as
    opaque strings — it never string-literals a game id. Game owns the
    `ActionCatalog` — `{ actions:[{id, kind, essential}], contexts:[ordered ids],
    defaults, coexist }` — and hands it to the scene-owned resolver at
    construction.

14. **Persistence via an injected `SettingsStore`.** A dumb, namespaced
    key-value engine abstraction; the backend is **injected** from the
    composition root (localStorage default on web and Electron; Electron-disk /
    FS-Access later) — never platform-detected inside engine. Engine owns the
    global-threshold keys; game owns the binding-catalog blob (versioned, with an
    id-migration table; missing ref target → drop ref, fall back to current
    default, surface once; two-pass load: bindings first, then resolve refs). The
    **editor playtest uses an in-memory store** so rebinding mid-playtest never
    clobbers real saved bindings.

15. **Delivery: mechanism → migrate behind closures → aim → deferred UI.** The
    resolver lands first; consumers migrate one token at a time *behind the
    existing predicate closures* (behavior-preserving) with parity tests; aim
    follows; the polished rebind screen is deferred to the in-game-UI layer.

**Placement.** `engine/input/bindings/` (resolver, catalog types, activations,
expansion, `SettingsStore`) and `engine/input/aim/` (axis bindings, angle model,
active-device). May import engine + third-party; never game/editor. The game
catalog lives in `game/input/` (grows out of `game/input-bindings.ts`). `actions`
and the aim sample are placed on `UpdateContext` next to `input`, derived from
`ctx.input`, so the editor's whole-`Input` swap flows through for free.

## Alternatives considered

- **Two-layer logical-inputs (actions → named logical keys → physical).**
  Rejected for a flat action-map; "separately configurable" is the primary
  requirement, and a reference source covers "follow another action."
- **Live reference *chains* as the primary/unbreakable model** (the original
  `FF=Hold(SkipFF)=Interact` idea). Rejected as posed (unbreakable, multi-level,
  illegible), then re-admitted in a disciplined form: `REF` is a first-class,
  overridable, keys-only source with cycle detection and terminal-resolved
  display.
- **`REF` mirrors whole bindings (keys + activation), with an optional override.**
  Rejected: "advance is the same as interact, but actually it's holding not
  pressing" is confusing in code and UI. Making activation *always explicit* and
  `REF` keys-only is cleaner and kills the multi-binding activation surprise.
- **Per-action hold thresholds; two hold *types* (`hold` + `holdConfirm`).**
  Rejected twice by the user: a hold is a hold; one global player-configurable
  threshold, no types.
- **Positional (free-floating) crosshair for aim.** Rejected for angle-based aim:
  the bow already computes an angle; a point needs off-screen clamping and
  camera-follow rules, and H/V split only exists to serve a point.
- **cm/360 sensitivity unit.** Rejected as an FPS mouse-rotation category error;
  the honest unit for a stick driving an angle is **rad/s** at full deflection.
- **Sliders for numeric settings.** Rejected (now an AGENTS.md rule): raw number
  input + unit + live preview, clamp only the invalid domain.
- **`analog` as a third action kind.** Rejected: it has no activation/consumption/
  edge semantics; forcing it into the action union makes every consumer handle a
  kind that answers `fired`/`active` with nonsense. It's a separate axis family.
- **Big-bang rewrite of all consumers.** Rejected for incremental migration
  *behind the predicate closures* with per-token atomic cutover + parity tests.
- **Raw `localStorage` / Electron-only disk file / FS-Access mirroring saves.**
  Rejected for an injected `SettingsStore` abstraction (works web + Electron,
  backend swappable, settings ≠ saves).
- **Device-specific `REF` activation** (`REF(interact@kbd)`). Punted as a
  documented limitation — the fallback (explicit per-device binding) loses
  live-follow but excludes no capability; add device-scoped refs only if a real
  need appears.
- **Routing input through the global `EventBus`.** Rejected for the same reasons
  the in-game-UI plan gives (broadcast, non-consuming, per-type ordering loss).

## Approach / steps

### Phase 0 — Prerequisites (small, independently landable)

1. **Clamp `dt`** in `game.ts` (`const delta = Math.min(now - last, MAX_FRAME_MS)`)
   before anyone integrates — fixes a latent unclamped-variable-dt bug that stick
   integration would send into orbit on any alt-tab/GC hitch; also steadies
   physics.
2. **Export a `DeviceSnapshot` readonly interface** (`{ keyboard:{keys}, mouse:{
   buttons, position, wheel }, gamepads }`) that `Input` structurally implements,
   so the resolver depends on the interface, not the DOM-attached `Input` class.
3. **Non-allocating projection:** add `Camera2D.screenToWorld(screen, out)` /
   `worldToScreen(world, out)` out-param variants; make `gamepad.update` mutate
   stick `Vector2`s in place; reserve a scratch `Vector2` for aim sampling.

### Phase 1 — Engine mechanism (`engine/input/bindings/`)

4. **Catalog types + registration API.** `action-catalog.ts`:
   `{ actions:[{id, kind:'discrete'|'continuous', essential}], contexts:[ordered
   ids], defaults: Binding[], coexist }`. `Binding = { action, source, activation
   }`; `Source = Tokens | Chord | Ref`. Engine stores/iterates opaque strings.
5. **Expansion pre-pass** (`ref-expansion.ts`): resolve `REF`/chains to terminal
   physical sources; memoized; **whole memo nuked on any edit**; edit-time cycle
   rejection (canonical `actionId`-ordered back-edge) + resolve-time edge-drop
   backstop; dangle detection. Forbid `REF` as a chord member.
6. **Edge primitive + resolver** (`action-resolver.ts`): prev/curr
   `DeviceSnapshot` diff → `justPressed`/`justReleased`; per-token decision;
   fan-out to peer actions; activation timers (hold threshold, doubleTap window,
   repeat/DAS); toggle latches per-(context, action); continuous merge; token-
   level `consume(id)`; per-step `fired` count. API: `fired(id)`, `firedCount(id)`,
   `active(id)`, `consume(id)`. Standalone class: `new` + `.step(snapshot)` — no
   Scene/ECS/DOM; edge-reset triggerable on input-identity change.
7. **Diagnostics** (`bindings-diagnostics.ts`): three classes — `conflict`
   (N actions / 1 token in coexisting contexts), `dangling-ref`,
   `cycle-edge-dropped` — with a referrer/target exemption so a `REF` sharing its
   target's token is "linked," not "conflicting". (Surfacing UI is Phase 4;
   the computation lands here.) Essential-guard evaluates **resolved terminal
   tokens**, not binding count.
8. **`SettingsStore`** (`settings-store.ts`): dumb namespaced KV; backend
   injected at the composition root; versioned binding blob + id-migration table;
   two-pass load. Placed on the game bootstrap; engine keys for the global
   thresholds.
9. **Wire into the loop.** Resolver is scene-owned, constructed with the catalog
   (like `platformerDialogueBindings` is injected at `platformer.ts:132`); place
   `actions` on `UpdateContext` in `SceneManager.updateContext`, derived from
   `ctx.input`; snapshot token *values*, reset edges on identity change (editor
   swap). Resolution runs once per step before gameplay reads it.
10. **Tests** (`test/action-resolver*.test.ts`): scripted per-frame
    `DeviceSnapshot`s (the enemy-brain pattern) asserting fired/active/toggle/DAS/
    chord/ref-expansion/cycle/consume transitions. DOM-free.

### Phase 2 — Game catalog + migration behind the closures (`game/input/`)

11. **Author the catalog + defaults + contexts.** `interact=PRESS(E)`,
    `dialogue.advance=PRESS(REF(interact))`, `dialogue.fastforward=E whileHeld`,
    `cutscene.skip=Esc hold` (progress fill; **off interact**),
    `move.{left,right,up,down}=A/D/W/S whileHeld`, `jump=Space press`,
    `dash=Shift whileHeld`, plus menu confirm/cancel/nav. Mark essentials
    (open-menu/pause, menu-confirm, menu-cancel, movement).
12. **Adapt the predicate closures** to read actions:
    `DialogueBindings.advancePressed = ctx => ctx.actions.fired("dialogue.advance")`,
    `consumeAdvance = ctx => ctx.actions.consume("dialogue.advance")`,
    `navUpHeld/navDownHeld`, `CutsceneBindings.skipHeld`. Engine signatures
    unchanged; dialogue/cutscene migrate invisibly.
13. **Migrate game consumers per-token atomically** — the moment the resolver
    owns a token, its old site reads through `actions`, never raw keys (no frame
    with two edge detectors on one key). Order: `interaction-system`,
    `player-intent-system`, `player-movement-system`, `interact-hint-render-system`
    (its label now reads the live resolved glyph). Each with a parity test.
    Delete each old prev-frame flag in the same commit.

### Phase 3 — Aim axis-binding family (`engine/input/aim/` + `game`)

14. **Axis bindings + `AimComponent`** (game): one persistent angle; mouse source
    sets from `screenToWorld(mouse.position, out)`; stick source integrates
    `sample * sensRadPerSec * dt` (clamped dt) with deadzone + response curve;
    device switch seeds from current angle.
15. **`activeDevice`** (engine): asymmetric hysteresis; expose **two** signals —
    `promptDevice` (flips on any input) and `aimOwner` (sticky to last aim-axis
    input). Sensitivity (rad/s), deadzone, curve live in `SettingsStore`.
16. **Migrate `bow-system`** to read the `AimComponent` angle and the resolved
    fire action; remove its direct `mouse.position` read for aiming (raw
    `mouse.position` stays available for non-aim world-picking).

### Phase 4 — Deferred (lands with the in-game-UI layer)

17. Player-facing **rebind screen**: capture widget; ref rows as linked chips
    labeled by target (`↳ follows Interact`), resolved keys secondary/on-hover,
    per-key edit disabled on ref rows, off-device ref rows hidden on device-scoped
    screens; expanded token set + cross-device/multi-token warnings.
18. **Conflict surfacing + can-coexist graph** (derived from per-screen
    freeze-behind), **reset-to-defaults** (global + per-action), the **number-field
    settings UI** (raw number + unit + live "hold/tap to feel it" preview, no
    sliders), and the **global hold-threshold / repeat / sensitivity** editors.
19. **Masked-input integration**: the UI plan's per-token mask becomes the
    upstream filter over the snapshot the resolver already consumes.

## Research findings that drove this

**Prior art (external).**
- **Press-vs-hold on the same key bound to two different player-facing actions is
  genuinely rare** — only Steam Input "activators" (an external overlay) expose
  it; almost no shipped game's own menu does. Shipping it natively beats
  essentially every built-in rebinder. The convergent model is
  **(action, activation)** pairs: Steam activators (Press/Long-Press/Double/
  Start/Release), Unity Interactions (Tap/Hold/SlowTap/MultiTap).
- **Hold↔toggle is the single most-praised motor-accessibility feature** (TLOU2
  converts every hold→toggle). The Game/Xbox Accessibility Guidelines state the
  hold *duration itself* is the barrier — remapping the key alone doesn't fix it;
  the player must be able to convert to toggle and tune the duration.
- **Player-facing conflict detection is never free from an engine** and must be
  hand-built; Rewired's category-selective conflict checking is the model for
  context-scoped conflicts.
- **Multiple bindings per action** is common (Celeste allows 8; Factorio
  primary+secondary). Store physical scancodes (survive relaunch/locale).
- **Player rage** clusters on: no/partial rebinding; hold-with-no-toggle; rebinds
  that don't apply live or leave prompts showing the old key; coupled bindings
  where changing one breaks another; silent conflict overwrite; and **skip
  bound to the same button as confirm/interact causing accidental skips** — the
  exact pattern at `platformer.ts:142` today.

**Codebase precedents.**
- The `DialogueBindings`/`CutsceneBindings` predicate-closure seam
  (`dialogue-system.ts:23-37`, `cutscene-system.ts:6-8`, wired at
  `platformer.ts:132,141-144`) keeps Engine ignorant of game concepts and is the
  migration seam — actions adopt *behind* the closures with zero engine-signature
  churn.
- The `pressedThisFrame`/`consumeAdvance` shared-field handshake
  (`interaction-system.ts:21-22,50-52`, `dialogue-bindings.ts:20-25`) is the
  behavior token-level consumption must reproduce.
- No edge detection exists (`keyboard.ts` is held-booleans); every consumer
  re-rolls it — the shared edge primitive replaces all of them.
- `Input` is DOM-constructed (`keyboard.ts:48-53`, `mouse.ts:23-34`) and swapped
  wholesale by the editor `RunSession`; the resolver must consume a plain
  `DeviceSnapshot` and live on `UpdateContext`.

**Adversarial critique (three rounds) drove:** the shared cycle-checked expansion
pre-pass; nuke-memo-on-edit; the two-scope arbiter; token-level consumption and
ref/target contention; the opaque registration API; scene-owned resolver on
`ctx.input`; the DOM-free `DeviceSnapshot` seam; angle-based aim + rad/s;
two-signal active-device with hysteresis; the `dt` clamp; conflict/can-coexist
deferral; per-token atomic migration; and the `activation(source)` + keys-only
`REF` model itself.

## Risks & open questions

- **Bespoke surface area is the top risk** — resolver + expansion + arbiter +
  axis family + a multi-consumer migration is substantial net-new engine code.
  Mitigation: phased delivery; incremental migration behind closures keeps the
  game working throughout; DOM-free tests on the risky stateful core.
- **The four shared-expansion risks** (memo invalidation across referrers,
  transitive fan-out ballooning a ref, consumption contention on a shared token,
  and legible representation of refs/chains) all trace to the expansion pass;
  each has a committed fix (nuke-on-edit, bound+expose, target-priority+linked
  exemption, linked chips) but they must be implemented and tested together.
- **Conflict detection / can-coexist graph is inert until the UI phase** — no
  screens exist and freeze-behind is deferred. Acceptable because conflict
  *surfacing* is a rebind-UI concern; the now-phase registers contexts for
  ordering only. If the plan ever needs conflict logic sooner, the can-coexist
  substrate must be built early.
- **Migration parity** — the old prev-frame flags and the resolver must never
  co-source a token; per-token atomic cutover + parity tests guard this, and the
  editor `Input` swap must reset resolver edges without stale component flags.
- **`dt` clamp changes feel** — it fixes a real bug but alters behavior on frame
  spikes for physics too; pick `MAX_FRAME_MS` deliberately and verify in-app.
- **Active-device hysteresis thresholds** and **aim sensitivity/deadzone/curve
  defaults** are tuning values (feel), to be dialed against the running bow; the
  mechanism (two signals, asymmetric hysteresis, rad/s) is fixed.
- **Device-specific `REF` activation** is a documented limitation, not solved;
  revisit with `REF(id@device)` only if a real console+PC divergent-activation
  need appears.
- **`SettingsStore` editor isolation** — playtest uses an in-memory store;
  confirm no path lets a playtest write the player's real bindings blob.
