# Serializable sequences: replace generator cutscenes with an op-tree interpreter

- **Type:** refactor
- **Date:** 2026-07-14
- **Status:** draft

## Goal

Replace the generator-based cutscene machinery with a fully serializable
sequence runtime — authored in TS as pure data (code-as-data, like
`@serializable()`), saveable/resumable on any frame without replay hacks, and
loadable by a future editor sequencer. One API for all forward-only,
frame-driven flows (cutscenes, vignettes, tutorials); FSMs remain for modal,
re-entrant status (enemy brain, movement, quest lifecycle, melee).

## Context & problem

Cutscenes are TS generators yielding verb objects. Generators are not
serializable, so save/resume is a replay hack (`engine/sequence/resumable-sequence.ts`):
re-run the generator with effects suppressed, seek to the saved step id, with
`remember/recall` KV and spawn-ref tables as escape hatches. Consequences:

- **Live correctness bug:** `api.read` re-executes against the _post-load_
  world during seek (no replay guard, `resumable-sequence.ts:185`). The pickup
  tour's escort destination silently moves on resume; any read-dependent branch
  can diverge and hard-fail seek ("seek exhausted the sequence").
- **The ergonomics are already gone:** `parallel` is 60 lines of
  `remember("done:i")` bookkeeping; `moveTo`/`escort` manually record
  `addedAgent`/`addedFollow` for replay-safe cleanup; every verb author must
  hold the replay model in their head. The joy generators promised was already
  spent buying serializability badly.
- **Restore crash:** NPC chats run as dynamically fabricated cutscene defs
  (`dialogue:${knot}`) registered only inside `startCutscene` — a save taken
  mid-chat cannot restore in a fresh process (`cutscene-system.ts:70-74`).
- **Editor-dead:** a generator can never be authored or even viewed by the
  planned sequencer tool (audit `M-P1-10`); audit Part III §3 requires deciding
  the serializable verb model _before_ authoring the Act-1 cutscenes
  (`M-P0-6`), or that content becomes editor-unloadable legacy.
- Verb closure state (`lastX`, `stalled`, `leaderDone`) silently resets on
  resume; skip is a busy loop with a magic guard; a throwing scene halts the
  entire game loop (`cutscene-system.ts:94-100`, no rAF re-arm).

Constraints: save can happen on any frame (autosave never asks); restore
happens into a fresh process (only static registrations + serialized data
survive); effects must be exactly-once across save/load; the serialization
layer (`@serializable`/`@serialize`, default-constructible classes,
JSON-safe fields, stable `EntityId` strings) is the substrate and is not
changing. Test suite was deliberately deleted (was green-while-buggy);
replacement tests must be integration-level or not exist.

## Decision

**A sequence program is a static op-tree: pure data instances built by a
typed TS builder; op types, effects, predicates, and cast resolvers are code
registered by id with serializable params.** A small interpreter executes the
tree; its entire run-state is a serializable value
`{ cursor tree of stable step ids, write-once per-op memory, per-sequence
blackboard, pinned branch results }` — a cursor _tree_, not a single path,
because a `parallel` has one cursor per child. Resume = restore world +
run-state, re-issue the current op(s) (re-arm, never re-record). Skip = deterministic fast-forward via
per-op skip behavior. Two concurrency classes: **exclusive** cutscenes
(queued, skip UI, player lock — today's semantics) and **ambient** vignettes
(concurrent, no lock, `bark` instead of `dialogue`, no camera ops in v1).

Key rules (each one earned by critique against the actual code):

1. **Code/data line.** Op _instances_ are data: builder params are constrained
   to `SerializableValue` at the type level — a lambda in a def is a compile
   error. Op _types_/effects/predicates/cast-resolvers are TS functions
   registered by id. Defs live in TS modules (source of truth) and must
   round-trip to JSON (tested) so the editor can load them later.
2. **Stable authored step ids on every node — structural nodes (`seq`,
   `parallel`, `branch`) included**, never structural indices; duplicates
   rejected at def build. The run-state cursor tree and memory records key on
   these ids. Otherwise stale-save divergence is silent.
3. **`waitUntil(predicateId, params)` is the persistent-wait primitive.**
   Event waits are unsound across frames (bus cleared per frame, system order
   unenforced). "All ambush enemies dead" is a world query. A latched
   `waitFor(event)` convenience is legal _future vocabulary_ (event observed →
   latched into declared memory at a fixed frame point) but is **not built by
   this plan** — no spike scene needs it.
4. **No expression grammar, ever.** Predicates are named TS functions with
   typed data params. The vocabulary grows by adding functions, never syntax.
5. **Blackboards don't multiply.** Shared/cross-scene flags live in the
   existing `ChronicleComponent` (serialized, Ink-mirrored). The per-sequence
   blackboard is op-local plumbing only (e.g. chosen dialogue index). Branch
   results are pinned into run-state so fast-forward/resume cannot re-decide.
6. **Sequences are scene-local.** Cross-scene continuity = chronicle/quest
   flags + a trigger in the next scene. A sequence never spans a transition;
   a `goToScene` transition op as the _final_ step is legal future vocabulary,
   **not built by this plan** (no spike scene needs it).
7. **Write-once memory slots.** Each op declares a typed serializable memory
   schema (parallel child flags, dialogue spawn ref, moveTo/escort
   added-component flags). Re-issue re-runs the _arming_ half of an op but
   never re-derives a populated slot — else escort's cleanup flags clobber on
   load and the player permanently follows an NPC. Spawned-entity refs are
   interpreter-core, not per-op opt-in.
8. **Divergence = crash, loudly** (missing step id, unregistered def or
   predicate, memory schema mismatch). Explicitly chosen; improve later. Safe
   because saves are append-only slots — an older save always survives.
   Hot-reload is a _separate_ dev path (see step 2.10) so the crash never
   fires during the authoring loop.
9. **Gate split.** `isCutsceneActive` becomes two predicates:
   `isExclusiveSequenceActive` (player freeze, pickup block, interact
   hint/outline suppression, NPC-chat gate, skip hint) and
   `isAnySequenceActive` (rare). An ambient vignette must not lock the player.
   **Control-release refinement (1.3 gate outcome):** an exclusive sequence
   can hand player input back mid-run via `releaseControl`/`lockControl`
   (specialized verbs, not a stringly-typed mode) so a cutscene→live-combat→
   cutscene scene works without splitting into two defs. Run-state carries a
   serializable `controlReleased` flag; the _freeze_ gates evaluate
   `exclusiveActive && !controlReleased`, while queue ownership and skip
   remain tied to `exclusiveActive`. Cross-sequence stitching (option 3) stays
   available for genuine scene boundaries via the trigger primitive (2.8).
10. **Restore ≠ enter.** `Runtime` `onEnter` gains a reason
    `"fresh" | "revisit" | "restore"`: restore skips `repositionPlayer`/
    `setupCamera`; revisit recenters the camera and strips any thawed
    mid-flight camera transition.

## Alternatives considered

- **Journal + deterministic replay of real generators** (Temporal/Azure DF
  pattern; the current system is a hand-rolled variant). Keeps generator
  authoring 100%, and production systems validate it. Lost on two counts:
  the program stays code, so the editor can never author (only trace) it; and
  resume robustness _degrades with content complexity_ — any world-read that
  changes control flow can diverge at seek time, which is exactly today's live
  bug, structural to the approach rather than fixable by discipline.
- **Generator-as-compiler** (write `function*`, execute once at def time to
  emit the op tree). Rejected by user after comparison: real `if` statements
  silently compile to startup-time constants (footgun), and the sugar buys
  syntax, not expressiveness. The pure builder is honest about what it is.
- **Keep patching the generator system through Act 1.** The 2026-07-12
  hardening already converted authoring into a worse op-tree (remember/recall
  everywhere); audit §3 mandates the data model before Act-1 cutscene content
  anyway; patching just adds an interim of maintaining the replay hack.
- **Behavior-tree substrate for everything.** BTs won where reactive
  re-evaluation matters — which the FSM kernel already owns here. Quest
  lifecycle on the sequencer was sketched and rejected: it needs
  backward/lateral jumps (abandon, fail), and a sequence with arbitrary jumps
  is an FSM in a trenchcoat. Two paradigms, deliberately.
- **XState / statecharts.** Built-in persistence, but a 10-step linear scene
  becomes 10 named states + 10 `DONE` transitions of boilerplate; migration
  story for changed machines is weak. Wrong shape for linear flows.
- **Embedded VM snapshots** (JS-Interpreter, quickjs-wasi linear-memory
  snapshots; Lua+Eris has no browser port). Exact-point resume at the cost of
  opaque, version-locked saves and a second language + FFI boundary — the one
  thing a self-patching shipped game cannot accept.
- **Time-based track/timeline model** (Unity Timeline / Unreal Sequencer).
  Gameplay verbs are causal and variable-duration; both engines had to bolt on
  leaky patches (retroactive signals, keep/restore state) to reconcile
  discrete gameplay with scrubbing. Vertical event-list editor model chosen
  instead; if dense A/V sync is ever needed, it embeds as one
  `playTimeline(asset)` op riding the animation system's frame-events
  (audit Appendix B).

## Approach / steps

### Phase 0 — integration-test harness (before anything is deleted)

- **0.1** Rebuild the minimal fixture in `test/`: build a real `ECS` + the
  relevant systems headless, step N frames with scripted input, then
  `SaveManager.capture` → construct a **fresh** `Runtime`/world → restore →
  continue stepping → assert. No isolated unit tests of ops.
- **0.2** Acceptance scenarios (ported from the deleted suite's intent):
  effects fire exactly once across save/load; spawns not duplicated; dialogue
  not reopened; save mid-`parallel` with children at different steps;
  divergence (renamed step id) crashes loudly; save→restore mid-NPC-chat in a
  fresh process (the current crash) works. **Contract:** Phase 0 lands the
  harness plus these scenario specs; the scenarios are implemented against the
  new runtime as Phases 1–3 land (marked expected-fail/skipped until their
  subject exists). All green is the exit criterion for the deletion step
  (3.6).

### Phase 1 — authoring spike (types only, no interpreter)

- **1.1** Define the data model + builder, enough to typecheck and serialize:
  `engine/sequence/op.ts` (op node union: `seq`, `parallel`, `branch`,
  `waitUntil`, `wait`, leaf op instances `{ type, stepId, params }` — every
  node, structural included, carries an authored `stepId`),
  `engine/sequence/sequence-def.ts`
  (`SequenceDef { id, class: "exclusive" | "ambient", cast, root }`),
  `engine/sequence/builder.ts` (combinators; `SerializableValue`-constrained
  params; duplicate-step-id rejection at build). **Includes the typed leaf-op
  builder signatures and predicate/param ids for the full spike vocabulary**
  (`dialogue` with choice→blackboard capture, `bark`, `spawn`/`despawn`,
  `walkTo`/`moveTo`, `escort`, `cameraTo`/`focusOn`, `fade`, `wait`,
  `enemiesDead`-style predicates) — signatures only, no executors.
- **1.2** Author 4 demo-level cutscene defs against those types, chosen for
  API coverage: **checkpoint at the bridge** (choice → blackboard → branch,
  faction side effect, choices block skip), **ambush drill** (spawn/despawn,
  parallel barks, cutscene→live-combat→cutscene via `waitUntil(enemiesDead)`,
  trigger start), **campfire stargazer** (long linear talking — the
  ergonomics baseline), **lost critter** (two ambient parts sharing chronicle
  state across live gameplay, spawned entity persisting across save/load,
  one-shot trigger).
- **1.3 Gate (asymmetric):** if any scene can't be expressed cleanly, the API
  is rejected/amended; if all four express, the API is _not yet validated_ —
  runtime gates below do that. Additionally: all four defs serialize to JSON
  and re-instantiate equal (round-trip test), proving the editor path.

### Phase 2 — engine: interpreter + supporting changes

- **2.1** `engine/sequence/sequence-run-state.ts` — `@serializable` value type:
  cursor tree (per-`parallel`-child cursors keyed by child step id), per-step
  memory `Record<stepId, SerializableValue>`, blackboard, pinned branch
  results, spawned refs.
- **2.2** `engine/sequence/op-registry.ts` — `registerOpType`,
  `registerPredicate`, `registerCastResolver`, `registerEffect`; lookups crash
  on unknown id.
- **2.3** `engine/sequence/interpreter.ts` — tick current op; op executor
  contract `{ arm(ctx, params, memory), poll(ctx) → done, skip(ctx) → snap,
skippable? }`; write-once memory semantics; branch predicate evaluated once
  and pinned; error contract: throw (crash policy).
- **2.4** `engine/sequence/sequence-component.ts` +
  `engine/sequence/sequence-system.ts` — replaces `CutsceneComponent`/
  `CutsceneSystem`. Exclusive: singleton + FIFO queue (preserving
  queue-while-active for Ink `start_cutscene`), skip-hold handling, cast
  resolution at start (not enqueue). Ambient: concurrent entities, no lock.
  Exposes `currentSkippable`/`skipHeldTime` for the skip-hint HUD and the two
  gate predicates (rule 9).
- **2.5** Engine ops: `wait` (elapsed in memory), `fade`, `cameraTo`/`focusOn`
  (exclusive-only), `parallel` (child done-flags in memory; skippable iff all
  children are; child error crashes per policy — spec'd, not accidental).
- **2.6** Camera serialization: `@serialize` pose/zoom on `Camera2DComponent`,
  targets/config on `Camera2DFollowComponent`, progress on
  `CameraTransitionComponent` (a deserialized `fade === null` cut-phase is
  legal, decided behavior); `spawn-camera-2d.ts` becomes find-or-create.
  `ScreenFadeComponent` tween progress serialized.
- **2.7** `Runtime.onEnter(reason)` — `"fresh" | "revisit" | "restore"`
  threaded through `runtime.ts`/`scene-runtime.ts`; restore skips
  `repositionPlayer`/`setupCamera`; revisit recenters camera, strips thawed
  transitions.
- **2.8** Trigger primitive (thin end of audit `M-P0-4`):
  `engine/trigger/trigger-volume-component.ts` (physics sensor, one-shot/
  repeat, optional chronicle-flag condition) + system emitting enter events;
  game binds "start sequence by id".
- **2.9** `bark` op + overhead-text presentation (`game/dialogue/` bark
  component/system/renderer) — ambient's non-blocking speech. Full `dialogue`
  op is exclusive-only.
- **2.10** Dev hot-reload: def re-registration re-seeks in-flight sequences to
  the current step id, restarts the sequence if the id vanished; cached def
  pointers invalidated. Plus the debug surface: current-op path + blackboard +
  memory dump and a per-op trace (console; embryo of the editor view).
- **2.11** Def manifest: one side-effect-import module registering all defs;
  remove implicit registration from the start path; coverage test that every
  def id referenced by content (Ink `start_cutscene` args, trigger volumes)
  resolves.

### Phase 3 — game: ops, migration, deletion

- **3.1** Game ops as registered executors: `walkTo`, `moveTo`, `escort`,
  `follow`/`release`, `dialogue`, `say`, `spawn`/`despawn` — logic ported from
  `game/cutscene/verbs.ts`, minus remember/recall (now declared memory), with
  arm/record split per rule 7.
- **3.2** Dialogue op: `mirrorInkState` atomically after `ChoosePathString`
  (closes the one-frame Ink divergence window); spawned dialogue entity ref in
  memory; mid-page resume rides existing `rehydratePages`.
- **3.3** NPC chat becomes **one** parameterized def (`{ knot, npc }` args in
  run-state) started by `dialogue-trigger-system.ts` — deletes the per-knot
  dynamic registration and its restore crash.
- **3.4** Port `pickup-tour-cutscene.ts` (+ kiss) to defs. Migrate the 6
  `isCutsceneActive` call sites per the gate table (rule 9); rewire
  `skip-hint-system.ts`.
- **3.5 Runtime gate (before deletion):** pickup tour on the new runtime
  behaves identically to the old one (compared while both still exist in the
  tree); campfire scene runs in the demo level, started by interact (via the
  existing Ink `start_cutscene` path); save/load mid-scene round-trips per
  Phase-0 scenarios.
- **3.6** Delete: `engine/cutscene/*`, `engine/sequence/resumable-sequence.ts`
  - `sequence-state.ts`, `game/cutscene/verbs.ts`, old generator defs.
    `bun check` green; Phase-0 suite all green (exit criterion).
- **3.7** Fix the pickup-tour quest early-resolve bug (tells you to return
  before any pickup) while in that content — small, adjacent, tracked here so
  it isn't lost.

### Phase 4 — content

- **4.1** Bring the remaining three spike scenes to life in the demo level
  (checkpoint, ambush, lost critter) — triggers placed, playtestable.
- **4.2** Retrospective: what the API vocabulary still lacks before the
  Burning/Camp cutscenes (`M-P0-6`) are authored on it.

## Research findings that drove this

- **Nobody serializes native coroutines.** C# rejected it formally
  (csharplang #2741: compiler state is version-fragile; "explicitly define the
  state that should survive"); redux-saga punted ("persist the store, sagas
  are ephemeral"); regenerator died archived with the one serialization
  request unanswered. Lua's Eris (the classic mid-cutscene-save answer) has no
  browser port.
- **Shipped save-anywhere games interpret data programs.** SCUMM serializes
  script slots + a dedicated cutscene stack; RPG Maker serializes
  `Game_Interpreter` (`_list`, `_index`, `_waitMode`) wholesale — mid-event
  saves Just Work; Ren'Py saves "the current statement and all statements that
  can be returned to" with symbolic labels; Ink (in this repo) is a
  serializable VM whose program counter is a _symbolic path_. Convergent
  lessons adopted: symbolic step ids (Ink's positional paths are its
  Achilles' heel — inky #253), explicit wait descriptors that re-arm on load,
  named states for long-lived logic, all mutable state in named stores.
- **Papyrus is the cautionary tale** for maximal power: full script threads in
  saves → orphaned instances, save bloat, an ecosystem of save-surgery tools.
  Keep the serialized surface small and enumerable.
- **Durable execution** (Temporal/Azure DF/Restate/DBOS) validates
  journal+replay for straight-line imperative code — and its determinism
  constraints and `patched()` versioning story show the discipline cost that
  killed the replay option here once world-reads enter control flow.
- **Authoring-tool survey:** instruction lists (RPG Maker, Dialogic, Naninovel
  — text DSL + visual editor over the _same_ event array) fit causal
  variable-duration gameplay verbs; time-based tracks (Unity/Unreal) fit dense
  A/V sync and had to bolt on leaky patches for discrete gameplay. Adventure
  Creator proves an instruction list is _not_ automatically save-anywhere —
  per-action in-flight state must serialize too (hence declared memory slots).
  AGS proves skip-as-deterministic-fast-forward with per-command semantics.
- **Codebase audit:** ~1,500 LOC deletable with a narrow touch surface (2
  start sites, 6 gates, 1 HUD reader); the FSM kernel is good and orthogonal;
  camera entity is currently dropped from saves entirely; `onEnter` cannot
  distinguish restore from fresh entry; honest replacement estimate is
  ~1,200–1,700 LOC — **flat, not smaller; the win is semantics
  (no replay discipline, direct-state resume, editor-loadable data), not
  size.**

## Risks & open questions

- **Ergonomics is validated late.** The spike falsifies syntax, but feel
  (iteration, debugging) is only proven at the 3.6 runtime gate. Mitigations:
  hot-reload + debug trace are v1 deliverables, and the campfire scene is
  deliberately the boring linear case that must read well.
- **Actor contention between classes** (an exclusive NPC chat starting on an
  entity an ambient vignette is driving) is unspecified. v1 convention:
  ambient defs must not cast entities that exclusive scenes cast; revisit when
  it first bites (likely the Burning). Not enforced mechanically yet.
- **Ambient + freeze/thaw:** an ambient sequence frozen mid-op on scene exit
  resumes on revisit (coherent per critique), but nothing stops an author
  making it feel wrong (a bark resuming days later). Authoring convention;
  the trigger's one-shot/condition fields are the tool.
- **Crash-on-divergence is deliberately crude.** Accepted; append-only save
  slots bound the damage. Revisit before shipping to players.
- **`M-P0-4`/`M-P1-10` re-scoping:** this plan absorbs the thin trigger
  primitive and fixes the sequence data model that `M-P1-10`'s editor tool
  must consume (vertical event list, _not_ the audio `<Timeline>` widget);
  the audit doc should be annotated when this lands.
- **The Burning remains underspecified** (story-side); the ambient/exclusive
  composition it needs is exactly what Phase 4's scenes rehearse.

## Parallelization

This refactor is ~80% an inherently serial _design-convergence_ spine —
**Phase 0 harness → Phase 1 types + 1.3 gate → Phase 2.1–2.5 interpreter →
Phase 3 migration/deletion**. The interpreter files (`op-registry`,
`interpreter`, `sequence-run-state`, `sequence-system`) are mutually entangled
against a contract that is deliberately unstable until the 1.3 gate; splitting
them across agents would produce divergent interpretations and merge churn.
**Do not parallelize the spine, and do not parallelize Phase 3** (migration
against the live contract).

The genuine wins are the **independent leaf subsystems**: file-disjoint from the
interpreter and from each other, mechanical rather than design-sensitive, and
carrying domain detail (camera math, physics sensors, HUD rendering) best kept
_out_ of the interpreter's design context. Dispatch these to subagents up front,
concurrent with Phase 0/1 on the main line; they rejoin at 2.5.

| Chunk                               | Files (disjoint)                                                                                                              | Interpreter dep?                                                    | Verdict                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| **2.6** Camera + fade serialization | `engine/camera/{camera-2d,camera-2d-follow,camera-transition}-component.ts`, `ScreenFadeComponent`, `game/spawn-camera-2d.ts` | none — `@serialize` + round-trip                                    | dispatch now                            |
| **2.8** Trigger volume primitive    | new `engine/trigger/trigger-volume-{component,system}.ts`                                                                     | none — emits enter event; "start sequence by id" is a stubbed seam  | dispatch now                            |
| **2.9** `bark` _presentation_       | new `game/dialogue/bark-{component,system,renderer}`                                                                          | presentation none; only the `bark` _op executor_ needs the registry | presentation parallel; wire op on spine |

Scheduling overlap: the **Phase 0 harness scaffold** (headless ECS boot +
`SaveManager.capture` → fresh `Runtime` → restore loop) has no dependency on the
op design and can be built concurrently with Phase 1 types; only the scenario
assertions wait for their subjects (already expected-fail per 0.2).

Kept on the spine deliberately: **2.7 `onEnter(reason)`** — tiny but threads
through `runtime.ts`/`scene-runtime.ts`, which the sequence-system also edits;
coordination cost exceeds the task, so do it just-in-time.

Subagents run in worktree isolation (they commit simultaneously) and each
returns a self-contained subsystem with its own round-trip / enter-event test.
