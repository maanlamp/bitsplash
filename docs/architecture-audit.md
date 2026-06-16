# Architecture Audit

> Date: 2026-06-15
> Authoritative sources: `README.md` (layering rules, design goals, status), `CLAUDE.md` (tooling, conventions).
> Scope: architectural integrity, layering, boundary correctness, abstraction quality. **Not** style/lint.
> Method: dependency-direction grep across `src/engine|editor|game`, plus targeted reads of the
> ECS/serialization framework, the `Game`/`FantasyPlatformer` ownership graph, and the newly-added
> Ink/quest/FSM feature.

Findings are calibrated: **High** = explicit violation of a documented rule with direct code evidence;
**Medium** = strong, impactful, but partially intentional or doc-acknowledged. Low-confidence items are
excluded per the audit discipline.

---

## 1. Executive Summary

- **The engine imports both the editor and the game layer** from a single file (`engine/font-settings.ts`),
  a direct, two-way violation of the project's top architectural rule (`Engine ← Editor`, `Engine ← Game`).
  This alone makes the engine non-reusable, contradicting its stated reason to exist.
- **The editor is coupled to one concrete game** (`FantasyPlatformer`) rather than to a generic engine
  abstraction. The README forbids "Editor → Game" imports; `app.tsx`/`perf-monitor.tsx` import the game's
  god-object directly. This is the same knot as the documented "kill `Game.world` singleton / generalize
  `FantasyPlatformer`" seam.
- **The serialization framework has no field-level exclusion mechanism.** Every enumerable field is encoded;
  there is no `@transient`/`@nonserializable`. This is the _root cause_ that forces components to persist
  runtime working state, directly undermining the "save = authored initial state only" rule.
- **Concrete fallout of the above:** `ArrowComponent` serializes 6 runtime-only fields; `StateMachineComponent`
  serializes `current`/`elapsed`/`params` (runtime working state derivable from `defId` + simulation).
- **`FantasyPlatformer` is a god-object** holding world creation, ~25 gameplay + ~7 render system
  registrations, tilemap, initial-level load, _and_ the play/edit snapshot→simulate→restore lifecycle. The
  lifecycle is engine-shaped behavior living in the game layer (README already flags this for the Scene
  refactor).
- **Positive / doc drift:** the planned custom value-type registry is **already implemented** (`Vector2` +
  `Angle` both via `@valueType`), but README still describes `Vector2` as a hardcoded `instanceof` special
  case. The docs are stale here, not the code.
- **The Ink narrative substrate is under-promoted to the game layer** (§3 M3). The `InkStoryComponent`, the
  story compile/rehydrate lifecycle, and most of `DialogueSystem` are generic, reusable narrative tech —
  directly analogous to the FSM core and `rich-text` that the project already promoted into engine. Only the
  `EXTERNAL` quest/item bindings and `.ink` content are genuinely game-layer. Not a dependency _violation_,
  but an inconsistent boundary.
- The **engine FSM core split is correct** (generic core in `engine/fsm/`, defs in `game/fsm/`), and there are
  no engine→game imports from the quest/Ink code itself.

---

## 2. Architectural Boundary Violations (Highest Priority)

### Theme A — Engine depends on upper layers (breaks reusability)

**A1. Engine imports editor AND game.** — _High_

- **Location:** `src/engine/font-settings.ts:4-5`
- **Code:**
  ```ts
  import {
  	fontStyleLabels,
  	type FontStyleLabel,
  } from "../editor/font/font-preview";
  import fsPixelSansUrl from "../game/assets/fs-pixel-sans-unicode.font.zip?url";
  ```
- **Violation:** README §"Engine" lists _Editor code_ and _Game code_ as **Forbidden**. This file violates
  both arrows at once (`Engine → Editor`, `Engine → Game`). `FontSettings` is a `@valueType` — engine
  serialization infrastructure — yet it pulls a UI label enum out of the editor and defaults to a game asset
  URL. The engine can no longer compile/ship without the editor and game present.
- **Correct shape:** `FontSettings` keeps a primitive variant representation (e.g. its own enum/string in
  engine); `fontStyleLabels` is editor presentation and should be derived in the editor from the engine type,
  not the reverse. The default font is project content — the engine should default to empty/none and the game
  supplies its asset URL at construction.

### Theme B — Editor depends on a concrete game

**B1. Editor imports `FantasyPlatformer` and a game component.** — _High (doc), with intentional tension_

- **Locations:**
  - `src/editor/app.tsx:12` `import { DebugTagComponent } from "../game/components/debug-tag";`
  - `src/editor/app.tsx:13` `import FantasyPlatformer, { Layer } from "../game/fantasy-platformer";`
  - `src/editor/perf-monitor.tsx:2` `import type FantasyPlatformer from "../game/fantasy-platformer";`
  - `src/editor/sprite/sprite-editor.tsx:15` → `game-view-panel.tsx` (game-view host)
- **Violation:** README §"Editor" lists _Game code_ as **Forbidden**. The editor is bound to one specific
  game's entry class instead of a generic engine `Game`/`Scene` it can host and edit.
- **Why it matters / link to roadmap:** This is the editor-side face of the documented "Kill the `Game.world`
  singleton" + "generalize `FantasyPlatformer` into a Scene factory" seam (README Build order #3 / cross-cutting
  seams). The editor should target an engine `Scene`/`Game` interface; the concrete `FantasyPlatformer` should
  be injected/registered as a scene kind, not imported by name.
- **Note:** `register-renderers.tsx:5` carries a commented-out `import ... "../game/font-settings"` — dead
  reference; remove during cleanup.

---

## 3. Misplaced Responsibilities

### M1. Play/Edit lifecycle lives in the game layer

- **Current location:** `src/game/fantasy-platformer.ts:194-224` (`setSimulating`, `restore`)
- **Incorrect responsibility:** snapshot (`serializeWorld`), system add/remove on simulate toggle,
  `world.clear()` + reload, and the `snapshot: SerializedWorld` field are all **generic engine behavior**
  (any scene needs snapshot→simulate→restore). They sit in a game class.
- **Suggested correct location:** the engine `Game`/(future) `Scene`/`SceneManager` owns
  `setSimulating`/snapshot/restore; the game only supplies the spawn-runtime-on-play hook
  (`spawnRuntimeEntities`) and its system set.
- **Reasoning:** README §Scene System explicitly states "the snapshot → simulate → restore +
  spawn-runtime-on-play flow moves out of `FantasyPlatformer` into the Scene/SceneManager (engine)." This audit
  confirms it has not happened yet.

### M3. Ink narrative substrate under-promoted to the game layer — _Medium_

- **Current location:** `src/game/ink/{loader,bindings}.ts`, `src/game/components/ink-story.ts`,
  `src/game/systems/dialogue.ts`.
- **What is generic (engine candidates):**
  - `InkStoryComponent` (`components/ink-story.ts:4-8`) — `story: Story | null` (live, non-serialized) +
    `state: string` (serialized). No platformer specifics. Structurally identical to how the engine already
    hosts `StateMachineComponent`.
  - `loader.ts:22-31` (compile `.ink` via inkjs) and `bindings.ts:40-53` (`ensureStory` →
    `state.LoadJson` rehydrate) — generic inkjs runtime lifecycle.
  - `DialogueSystem` (`systems/dialogue.ts`) — typewriter reveal, `splitSentences`/`paginate`, rich-text
    wrapping, choice navigation, story stepping (`Continue`/`currentChoices`/`ChooseChoiceIndex`). Generic
    narrative _presentation_; it already consumes `engine/rich-text.ts`.
- **What is genuinely game-layer (stays):**
  - `bindings.ts:11-38` — `EXTERNAL` functions (`start_quest`/`advance_quest`/`decline_quest`/`give_item`)
    emitting game events (`StartQuestEvent`, …).
  - `src/game/ink/*.ink` content and `ink/fonts.ts` (`doublehomicide` asset mapping).
- **Why it's a finding (not just a preference):** the project already established the correct split twice —
  the **FSM** (generic core in `engine/fsm/`, defs in `game/fsm/`) and **rich-text** (in engine). The Ink
  substrate is the same shape (a generic VM + game content/bindings) yet sits entirely in game, leaving the
  rich-text _renderer_ in engine while its only _driver_ is in game.
- **This should never have been game-layer.** A narrative-VM integration and a dialogue presentation system
  are engine substrate by definition — the same class as FSMs/BTs that the game _consumes_. There was no
  genuine placement uncertainty to resolve by parking it in game, so the POC-in-game-then-promote loop (which
  is for genuinely unclear cases, e.g. prefabs) does not apply here. Treat this as a misplacement to correct,
  not a deferred decision.
- **It is not a dependency _violation_** (engine doesn't import it; game may use engine) — which is why it's
  filed as Medium rather than High. The only real blocker is mechanical: `DialogueSystem` currently imports
  `PlayerInputComponent`, `InteractionStateComponent`, `InputBindings`, and game `events`, so it must be
  decoupled (player-lookup query, input intent, open/close events injected as data) before it moves.
- **Suggested correct location:** engine owns the Ink integration substrate (`InkStoryComponent` +
  compile/rehydrate) and the generic dialogue/typewriter/pagination presentation system (with externals
  injected); game keeps the `EXTERNAL`→event bindings and the `.ink`/font content.

### M2. `FantasyPlatformer` is a god-object

- **Current location:** `src/game/fantasy-platformer.ts:80-229`
- **Concerns bundled:** Game/world creation, `TileGrid` + `TileCollisionBaker`, decoration systems, ~25
  gameplay system registrations, ~7 render system registrations, initial `loadDemoLevel()`, accessor getters
  (`ecs`/`world`/`audio`/`assetManager`), and the M1 lifecycle.
- **Suggested correct location:** decompose along the documented Scene seam — a thin scene _factory_ (build
  world + system set) separated from lifecycle (engine) and from content loading (data). This is roadmap work,
  not a quick fix, but the audit records the current coupling as the baseline.

---

## 4. Abstraction Issues

### 4.1 Missing Abstractions (high confidence)

**MA1. No field-level serialization exclusion.** — _High_

- **Location:** `src/engine/serialization/serialize.ts` (iterates all `Object.entries()` of a component; no
  opt-out marker exists anywhere in `serialization/`).
- **Why it's a true missing abstraction:** the documented rule is "save = authored initial state only; never
  serialize derivable/runtime data." With no `@transient`/`@nonserializable` decorator, a component author's
  only choices are _serialize everything_ or _make the component non-serializable_. The rule is therefore
  unenforceable at the framework level and is already being violated (see MA1 fallout below). A single
  field-level marker is the conceptual boundary that's missing.
- **Fallout already present:**
  - `src/game/components/arrow.ts:12-17` — `launched`, `stuck`, `stuckRemaining`, `attachedTo`,
    `attachOffsetX`, `attachOffsetY` are runtime state written by `arrow-system.ts` and never meaningfully
    restored; they are persisted into level/save data anyway.
  - `src/engine/fsm/state-machine-component.ts:12-14` — `current`, `elapsed`, `params` are runtime working
    state derivable from `defId` + simulation; serialized as-is. (`def` is correctly left null/non-serialized.)
- **Counter-example that proves the pattern is wanted:** `src/game/components/ink-story.ts` deliberately keeps
  the live `Story` out of serialization and persists only the `state` JSON string — but achieves it by
  _omitting a field type the codec can't encode_, not by an explicit marker. The intent exists; the mechanism
  doesn't.

### 4.2 Over-engineering

- None rising to a high-confidence architectural finding. The codebase generally errs toward
  under-abstraction (4.1) rather than premature generalization. The `RigidbodyComponent` physics-helper
  methods (`applyForce`/`applyImpulse`, `engine/components/rigidbody.ts:48-57`) technically add behavior to a
  "data-only" component, but the component is the **explicitly blessed ECS↔physics bridge** that already wraps
  a live `Body`; the thin pass-throughs are consistent with that documented exception, not an over-abstraction.
  Noted, not flagged.

---

## 5. Industry-Standard Replacement Opportunities

- **None recommended at high confidence.** The deliberate hand-rolled choices (ECS, serialization codec, FSM)
  are the stated _point_ of the project (README: "custom 2D game engine"), and the genuinely third-party-worthy
  pieces already use libraries (`planck` physics, `inkjs` narrative, `fflate` unzip, `motion/react`,
  `@base-ui/react`). No custom solution here is both a maintenance burden _and_ clearly replaceable without
  contradicting the project's reason to exist.

---

## 6. Structural & Consistency Issues

- **Doc drift — value-type registry.** README §Data Model still says "the only special type (`Vector2`) is
  hardcoded in `serialization/value.ts`" and lists the registry as 💡 planned. The registry is **already
  built** (`serialization/value-type-registry.ts`) with `Vector2` _and_ `Angle` registered via `@valueType`.
  Update README to reflect completion. (Code correct; docs stale.)
- **Missing `@serializable` on notice components.** `src/game/components/quest-notice.ts` (and pre-existing
  `death-notice.ts`) lack a `@serializable(...)` registration. Likely intentional (transient overlay state),
  but it should be a _deliberate_ decision once MA1's marker exists, not an implicit gap.
- **Dirty: inspector renderer registry overloaded for two concepts (self-introduced, needs refactor).** — _Medium_
  - **Location:** `src/editor/value-renderers.ts`, consumed by `src/editor/inspector.tsx`
    (`FieldControl` for nested field values **and** `ComponentSection` for whole components), populated by
    `src/editor/register-renderers.tsx`.
  - **What's wrong:** `registerValueRenderer`/`getValueRenderer` is keyed by constructor and now serves two
    different things through one map: custom UI for a `@valueType` _field value_ nested in a component
    (`FontSettings`, `Vector2`, `Angle`) **and** custom UI for an _entire_ ECS component (`SpriteComponent`).
    Different semantics, different render contexts (inside the `.fields` grid vs. replacing it), and the
    shared `fieldKey` prop is meaningless (`""`) for the component case. `ComponentSection` calling
    `getValueRenderer(component)` reads as a category error.
  - **Provenance:** introduced 2026-06-15 porting the `FontSettings` inspector layout to `SpriteComponent`
    (shared `PreviewField` shell). Expedient; flagged as debt rather than left to discover.
  - **Direction is open — do not assume.** Plausible paths (not a decision): model the sprite's renderable as
    its own `@valueType` so it flows through the _existing_ value-renderer path like `FontSettings` (component
    holds a value type, value type has a renderer — no whole-component rendering at all); or some other
    restructuring. Resolve the modeling question first; avoid bolting on parallel registries.

---

## 7. Remediation Passes (tracking)

Ordered to fix root causes before symptoms. Check off as completed.

### Pass 1 — Restore engine independence (High, small, unblocks "engine is reusable")

- [x] `font-settings.ts`: remove `../editor/font/font-preview` import; `fontStyleLabels`/`FontStyleLabel`
      now defined in engine, `font-preview.tsx` imports the type from there.
- [x] `font-settings.ts`: remove the `../game/assets/...` default URL; defaults to `""`. Game components
      (`dialogue`/`interactable`/`debug-tag`, `dialogue-render`, `ink/fonts`) supply `fsPixelSansUrl` explicitly.
- [x] Re-run the dependency-direction grep; confirmed `src/engine` has **zero** `editor`/`game` imports.

**Follow-on (incomplete-component UX, done alongside Pass 1):**

- [x] Added a generic `@required()` field marker (`serialization/field-enums.ts`) honored for both components
      (`serializable`) and value types (`valueType`); `isRequiredField(typeName, field)`.
- [x] Marked `FontSettings.font` `@required()`; empty value renders an inline field error + invalid outline,
      and the component section title shows an error badge (recursive into nested value types).
- [x] Fixed the broken `FontSettings` inspector input: registered a value renderer that recurses into its
      fields (file picker / family / size / variant enum) via the shared `FieldControl`, which now resolves
      value-type field metadata through `getValueTypeName` as well as `componentTypeName`.
- [x] Removed the dead commented `../game/font-settings` import in `register-renderers.tsx` (was listed under Pass 3).

### Pass 2 — Field-level serialization exclusion (High, root cause of §4.1)

> **Superseded by `docs/plans/serialization-opt-in.md`.** The opt-out `@skip` model
> below was a step toward §4.1, but the root design flips to **opt-in** field marking
> (`@serializable` class + `@serialize()` fields) with a **compile-time** guarantee —
> which resolves §4.1 / MA1 properly and dissolves the unfinished item here (a field
> that fails to encode is rejected at authoring time, never at save/load). Reference
> that plan when fixing other audit items that touch serialization. The completed
> boxes below stay accurate for the current code until the migration lands.

- [x] Add a field marker honored by `serialize.ts`/`deserialize.ts`. Landed as `@skip()`
      (`serialization/field-enums.ts`), opt-out model: registered components serialize all fields
      except those marked. Honored on both serialize and deserialize (stale save values can't override
      ctor defaults). Works on `@serializable` components and `@valueType` fields, mirroring `@required`.
- [x] Mark `ArrowComponent` runtime fields `@skip` (`launched`/`stuck`/`stuckRemaining`/`attachedTo`/`attachOffsetX`/`attachOffsetY`).
- [x] Mark `StateMachineComponent.current`/`elapsed`/`params` `@skip` (keep `defId`; `def` also marked `@skip` to make the no-codec omission explicit).
- [x] **Make un-encodable fields a hard error, not a silent skip.** _Resolved as superseded — see
      `docs/plans/serialization-opt-in.md`._ An interim implementation (a `serializeComponent` throw on
      un-encodable fields) was **reverted**: a throw during save/snapshot is player-facing and
      unacceptable. Opt-in marking makes this moot — an un-encodable field is simply never marked, so
      it is inert, and explicitly marking one is a **compile-time** error at the field, never a
      save/load failure.
- [x] Audit remaining components for runtime fields now expressible as `@skip`. Scanned all ~30
      components: no further `@skip` needed. Findings reviewed and dismissed — `bow.ts` is an
      intentionally-transient runtime-spawned POC (not serialized on purpose); `health.ts` `hp` is
      essential savegame state and must stay serialized (only fix: ctor now derives `hp` from `maxHp`,
      not the reverse); `debug-tag.ts` `font` is configurable by design. The config-component +
      runtime `-State`-component split (`PlayerInput`/`PlayerMovementState`,
      `Interactable`/`InteractionState`, `HealthBar`/`HealthBarState`) is a deliberate ECS pattern —
      `-State` components are lazily attached by their systems at play-time, not a serialization
      workaround — leave split.

### Pass 3 — Decouple editor from concrete game (High, larger — ties into Scene roadmap)

- [x] Introduce an engine-level `Game`/`Scene` abstraction the editor targets. Landed as an engine
      scene registry (`engine/scene/registry.ts` `registerScene`/`createGame`) + scene factory types
      (`engine/scene/scene.ts`: `SceneDefinition`/`SceneFactory`/`SceneSetup`). The editor now targets
      the engine `Game` type only (like `sprite/game-view-panel.tsx` already did). Full
      `Scene`/`SceneManager` stack stays deferred per `docs/plans/scenes.md` (migration steps 1–2 of
      that plan are what this covers).
- [x] Register `FantasyPlatformer` as a scene kind instead of importing it by name. `FantasyPlatformer`
      is gone; its constructor body is now the `"platformer"` scene factory in `game/scenes/platformer.ts`,
      registered via `registerScene`. `main.tsx` (composition root) imports the scene module for its
      side-effect registration and passes the kind to `<App defaultScene="platformer" />`; the editor
      builds it via `createGame(defaultScene)` and never imports a concrete game by name.
- [x] Replace the `DebugTagComponent` direct import. Done via **both** real fixes (they compose):
  - **Promoted to an engine primitive** — `DebugTagComponent` + `DebugTagSystem` moved to
    `engine/components/debug-tag.ts` / `engine/systems/debug-tag.ts` (engine font default now empty,
    no game-asset import). Component + system moved together (system+component-same-layer).
  - **Scene-supplied default template** — the create-default-entity template (Transform + Sprite +
    DebugTag with the game's font) is now supplied by the hosted scene via `game.defaultEntity(pos)`
    (`SceneSetup.defaultEntity`), so `app.tsx` hardcodes neither the components nor a game asset URL.
- [x] Remove the dead commented import in `register-renderers.tsx:5`. (done in Pass 1)

### Pass 4 — Move play/edit lifecycle into the engine (Medium, follows Pass 3 / Scene work)

- [x] Move `setSimulating`/snapshot/`restore` + the `snapshot` field from `FantasyPlatformer` to engine `Game`.
      `Game` now owns `setSimulating`, the `snapshot` field, the gameplay-system toggle, and the
      snapshot→simulate→restore flow.
- [x] Leave only the `spawnRuntimeEntities` hook + system-set definition in the game layer. The
      `"platformer"` scene factory returns `gameplaySystems`, `spawnRuntimeEntities`, and `restore`
      (content reload) as hooks on `SceneSetup`; the engine drives the lifecycle through them.

### Pass 5 — Promote the Ink narrative substrate to engine (Medium, follows decoupling)

- [x] Decouple `DialogueSystem` from game components. The engine `DialogueSystem`
      (`engine/dialogue/dialogue-system.ts`) takes an injected `DialogueBindings`
      (`advancePressed`/`consumeAdvance`/`cancelHeld`/`navUpHeld`/`navDownHeld`/`playerId` + text
      geometry); the game supplies the platformer impl (`game/dialogue-bindings.ts`) wired to
      `InteractionState`/`PlayerInput`/`InputBindings`. Open/close/reveal events moved to engine
      (`engine/dialogue/events.ts`); game consumers (`voice`, `damage-trigger`) import them from engine.
- [x] Move `InkStoryComponent` + story compile/rehydrate into engine. `InkStoryComponent` →
      `engine/components/ink-story.ts`; generic `compileStory` + `ensureStory(component, createStory,
    bindExternals)` → `engine/ink/story.ts`. The game `loader.ts`/`bindings.ts` now thin wrappers that
      glob the `.ink` sources and supply the `EXTERNAL` bindings.
- [x] Move the generic dialogue/typewriter/pagination presentation into engine. `DialogueComponent` +
      the typewriter/`splitSentences`/`paginate`/wrap/choice-stepping system now live in
      `engine/dialogue/` + `engine/components/dialogue.ts` (alongside `rich-text`). The game keeps only
      the platformer's `DialogueRenderSystem` (panel layout/colors) and `DialogueTriggerSystem`
      (knot/font-by-tag wiring).
- [x] Keep `EXTERNAL`→event bindings, `.ink` content, and the font map in `src/game/`.

### Pass 6 — Doc consistency (Low)

- [x] Update README §Data Model: value-type registry is done (`Vector2` + `Angle`, plus `FontSettings` + `FadeTimeline`).
- [x] Decide + document serialization intent for `quest-notice.ts` / `death-notice.ts`. Decision:
      both are **transient runtime overlay state** (system-spawned during play; `QuestNoticeComponent`
      isn't even zero-arg constructible) and stay **non-`@serializable`** — omitting the decorator is the
      deliberate marker. Documented in README §Data Model alongside the runtime `DialogueComponent`.
