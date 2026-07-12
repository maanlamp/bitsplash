# In-Game UI Layer

- **Type:** feature
- **Date:** 2026-07-09
- **Status:** draft

## Goal

Give in-game UI — pause/main menus, inventory & toolbar grids, dialog boxes,
quest notices, quest tracker, and every current HUD widget — the ergonomics of
web UI authoring: declarative TSX components, flexbox layout, CSS-like styling,
and **event-driven interaction** (`onClick`/`onFocus`/`onKeyDown` handlers), all
painted crisply through the existing WebGL2 `Renderer2D` at integer UI scale,
with **no** DOM/React-DOM overlay (whose sub-pixel anti-aliased text clashes with
strict pixel art). One authoring model, one UI paradigm, pixel-crisp output.

## Context & problem

**Rendering.** `engine/render/renderer-2d.ts` is WebGL2, `antialias:false`,
`NEAREST` everywhere. The draw API is per-layer (`drawImage/drawRect/drawText/
drawGlyph`, plus a nine-slice helper). Screen-space UI = layers `>= UI_LAYER_MIN`
(`engine/ui.ts`), painted origin-0 at `span = viewport / uiScale`. Within a layer,
paint order is call order (painter's); no depth. Text is already pixel-crisp
(runtime `NEAREST` glyph atlas + HarfBuzz shaping; `measureText`/`wrapText`/
`wrapRichText` exist; rich text drives dialogue).

**Current UI** is ~10 hand-rolled ECS render systems. Screen-space: dialogue
(`game/dialogue`), quest tracker (`objective-render-system`), quest notices,
death overlay, screen fade (`engine/fade/screen-fade-render-system`). World-space,
entity-anchored: health bars (`health-render-system`), quest markers
(`quest-marker-render-system`), interaction hints (`interact-hint-render-system`),
hitsplats (`hitsplat-render-system`). There is **no retained tree, no layout
engine, no focus/event routing**. Widgets are pure paint that read state off ECS
components mutated by their update systems. They use a hardcoded `UI_SCALE`
constant from `game/settings` for screen coordinates, not `scene.config.uiScale`.

**Interaction today is immediate-mode and hand-rolled.** `engine/input` wires DOM
listeners but collapses them into held-state booleans (`keyboard.keys[x]`,
`mouse.buttons`, `mouse.position`, `mouse.wheel`); gamepad is poll-only
(`navigator.getGamepads()`). There is **no edge detection** and **no "consumed"
concept** anywhere. Every consumer re-implements "just pressed" with its own
prev-frame flag (`interaction-system`, `player-intent-system`, dialogue nav in
`dialogue-system.ts`). Dialogue choice selection is the **only** interactive
in-game UI — keyboard-only, manual up/down edge-detect + manual advance-consume,
selection stored on `DialogueComponent` and read by a separate paint system. It
is the faithful proxy for what this layer replaces. Mouse hit-testing exists
**only in the editor** (via `Camera2D.screenToWorld`, which allocates a `Vector2`
per call). The scene stack's `blocksInputBelow` is a `receivesInput()` query
helper that `SceneManager.update` never consults — it is not an automatic
firewall; the editor's `RunSession` whole-`Input` swap is the load-bearing
capture mechanism today, and it lives in the editor layer.

**React is editor-only.** The game runs plain TS on a RAF loop (`engine/game.ts`),
outside React. `react@19.2.6` + `react-dom@19.2.6` power the editor via a single
root (`main.tsx`). `babel-plugin-react-compiler@1.0.0` (React Compiler) is
enabled. `react-reconciler@0.33.0` is present in `node_modules` but **absent from
`package.json`** and imported nowhere; `yoga-layout` is **not installed**. Both
are net-new dependencies for this work.

**Layering (AGENTS.md, strict):** Engine ← Game, Engine ← Editor. Engine must not
import game or editor.

## Decision

Build a new engine slice **`engine/ui/`** that owns a retained, React-authored UI
engine painted through `Renderer2D`, with an **event-driven input layer** as a
first-class part of the design. The spine:

1. **React via a custom `react-reconciler` host** whose instances are plain-object
   UI nodes (not DOM). Chosen over SolidJS for team familiarity (a deliberate
   trade — Solid is lighter on allocation, see Alternatives). React authored this
   way is canonical; there is no second imperative UI paradigm.

2. **Reconcile on discrete change, paint every frame.** React does work only when
   UI structure/state changes; a paint render system walks the retained node tree
   and issues `Renderer2D` draw calls every frame, independent of React. Idle
   frames cost ~0.

3. **Layout = Yoga** (flexbox, WASM) driven by a text measure-function backed by
   the glyph atlas, plus absolute/anchor positioning. Paint order = tree order;
   **no `z-index`**, **no CSS Grid** (uniform grids via flex + a `<Grid>` helper;
   spanning via absolute from cell size), **no `border-radius`** (nine-slice for
   framed corners).

4. **CSS-in-TS styling.** Typed style objects over a fixed flexbox + box +
   pixel-art property set (`nineSlice`, `textOutline` first-class). No CSS parser,
   selectors, or cascade. Shared "classes" are exported style constants;
   interactive states are conditional style objects.

5. **World-anchored widgets are a first-class node _kind_.** Health bars,
   nameplates, markers, hints, hitsplats are the same declarative components but
   skip Yoga flex and the focus tree; their screen position is computed per-frame
   by an **anchor system** off a non-allocating camera projection, with
   edge-clamp + point-toward for off-screen markers.

6. **A bypass channel for per-frame motion.** Per-frame values (health fill,
   cooldowns, alpha, anchored position/rotation, wave offsets) live in a separate
   `dyn` store keyed by node that the host config never touches. React owns
   structure/style; the bypass owns motion; they share no keys. Paint field-reads
   the merged view — never a `{...props, ...dyn}` spread (the measured per-frame
   allocator).

7. **Event-driven input layer (the material addition).** All input (keyboard,
   mouse, gamepad) is normalized into **one UI-event vocabulary** — `pointerdown`/
   `pointerup`/`pointermove`/`click`/`wheel`/`focusmove`/`confirm`/`cancel` — and
   dispatched to node handlers through **capture/bubble with `stopPropagation`/
   consumption**. This is an authoring surface over the same hit-test + focus
   machinery, giving React-idiomatic `onClick`/`onFocus`/`onKeyDown` props. Its
   design (transport, consumption, capture, frame slot) is specified in
   Approach §4.

8. **Input passthrough to gameplay is first-class.** Consumption is **per-input**,
   not all-or-nothing: the UI consumes only the input tokens it handles;
   everything unconsumed **falls through** to gameplay via a **masked Input view**.
   Clicking a UI element never reaches the world; a focused floating widget eats
   its nav/confirm keys but WASD still moves the player. **Modal** UI is focus-trap
   - consume-all (the whole-`Input` mask is the modal special case). Whether
     gameplay `update()` runs at all behind open non-modal UI (freeze-behind) is an
     **independent, deferred design toggle** the architecture must support, not
     decide.

9. **One synchronous commit per frame via `flushSyncFromReconciler`.** The game
   root is a sync `LegacyRoot`. The per-frame UI mutation phase — event dispatch
   (handler `setState`s), gameplay update (which enqueues game→UI intents), and
   the intent drain — is wrapped in `reconciler.flushSyncFromReconciler(fn)`,
   coalescing every `setState` into exactly one synchronous commit before paint.
   `setState` in handlers is fully first-class; the intent queue is only the
   game→UI transport (see Research findings for the spike that pinned this).

10. **Delivery: foundation-first, then incremental migration.** The new system
    runs alongside the old render systems; migrate screen-by-screen and delete
    each old system as its replacement lands.

**Placement.** `engine/ui/` may import third-party (`react`, `react-reconciler`,
`yoga-layout`) and engine modules; it must not import game or editor. Game screen
components live in game slices (`game/ui/` for shared chrome; per-feature
otherwise, reusing `game/dialogue/`, `game/quest/`, etc.). The editor
live-previews the UI (hot-reload); it gets no visual drag-and-drop authoring.

## Alternatives considered

- **SolidJS (`solid-js/universal`)** — structurally lighter (fine-grained, no
  VDOM, ~zero idle allocation, far fewer GCs in the spike). Rejected only for
  React familiarity, a deliberate trade. Revisit if the discipline invariants
  (§Risks) prove unenforceable.
- **Immediate-mode GUI** — great for dev/debug overlays; weak for retained
  menus/inventories with transitions and gamepad focus. Not the primary system.
- **`@pixi/layout` / PixiJS** — off-the-shelf Yoga-on-WebGL, but routes UI through
  Pixi's renderer/scene graph instead of the hand-rolled `Renderer2D`; invasive
  given the existing renderer investment.
- **Editor-authored / data-driven layouts** — fits the repo's data grain but
  loses TSX expressiveness and re-invents a binding layer; the listed UI is
  systemic (wired to game logic), not designer-placed content.
- **Real CSS/SCSS subset** — the documented scope-creep swamp
  (specificity/inheritance/`!important`/`calc`); CSS-in-TS gives the box/flex
  model without a stylesheet language.
- **Taffy** (adds CSS Grid) — Rust; WASM bindings not production-ready.
- **MSDF/SDF text** — intrinsically anti-aliased; wrong for strict pixel art.
- **Route UI events through the global `EventBus`** (`engine/events.ts`) —
  rejected. That bus is a broadcast, non-consuming, per-frame buffer keyed by
  event class, and existing code depends on the broadcast semantics
  (`DamageEvent` has 4 independent readers, `DeathEvent` 2). Input routing needs
  the opposite: targeted, ordered, consumable dispatch. Its per-type `read()`
  also loses cross-type arrival order (a `keydown` opening a menu must sequence
  before a `pointer` event that should then hit it). The UI event buffer is a
  **different, simpler structure** (a single ordered array with a per-entry
  `consumed` flag), owned by `engine/ui`; `EventBus` is left untouched for
  gameplay. This reuses the _pattern_, copies no code, and keeps a genuinely
  separate concern separate.
- **`unstable_batchedUpdates` for the per-frame flush** — rejected as the
  mechanism. A spike (§Research findings) showed React 19.2 does not sync-flush a
  legacy-root `setState` at the call site and coalesces default-priority updates
  on its own; `batchedUpdates` is unnecessary and `flushSyncWork()` is
  insufficient. `flushSyncFromReconciler(fn)` is the primitive that forces the
  single synchronous commit before paint.

## Approach / steps

New slice `engine/ui/` owns: the reconciler host + node model, Yoga glue, bypass
`dyn` channel, anchor system, the event/input layer (normalizer, dispatcher,
focus/nav, pointer router, masked-input arbiter), style resolution, and the paint
render system.

### §1 Reconciler host & node model

- UI node = plain object `{ type, props, children, yoga?, id }`
  (`engine/ui/reconciler/ui-node.ts`). Host config
  (`engine/ui/reconciler/host-config.ts`) is mutation-mode with **keyed-write**
  `commitUpdate` — writes only changed structural/style keys to `node.props`;
  never wholesale-replaces (the disjoint-ownership invariant, §Risks).
- Sync root (`LegacyRoot`, `isStrictMode=false`), created via `createContainer`
  with React 19's argument shape. The host config must implement the React-19
  surface the reconciler calls, including the update-priority trio
  (`resolveUpdatePriority`/`getCurrentUpdatePriority`/`setCurrentUpdatePriority`)
  — spike-confirmed as required.
- Yoga lifecycle in the host: `Node.create()` in `createInstance`, `free()` in
  `removeChild`/`detachDeletedInstance` (leak-tested).

### §2 Layout (Yoga)

`engine/ui/layout/`. Add the `yoga-layout` dependency. Flex + absolute/anchor.
**One shared wrap function** feeds both the Yoga measure callback and paint (else
measure/paint drift → clipped text); it handles Yoga `MeasureMode`
(UNDEFINED/EXACTLY/AT_MOST) and routes through the style-aware measure path
(plain `measureText` ignores bold/italic). Add a `{width,height}` helper composing
`measureText` + `wrapText().length * lineHeight`.

### §3 Paint

A render system (`engine/ui/paint/ui-render-system.ts`), registered like any
other, walks the node tree in tree order and issues `Renderer2D` draw calls into
layers `>= UI_LAYER_MIN` (anchored nodes paint in the UI-space band, §5). It reads
the **merged view** of each node — structural/style props (React-owned)
field-read-merged with `dyn` values (bypass-owned), **never** a spread. Coordinates
are virtual UI pixels read from `scene.config.uiScale` (not the hardcoded
`UI_SCALE`).

### §4 Event/input layer

**§4.1 Vocabulary & transport.** `engine/ui/input/ui-event.ts` defines the event
types. The buffer (`engine/ui/input/ui-event-queue.ts`) is a **single ordered
array with a per-entry `consumed` flag** — preserving cross-type arrival order —
owned by the UI layer. (Not the global `EventBus`; see Alternatives.)

**§4.2 Normalization.** `engine/ui/input/input-normalizer.ts` translates raw
`Input` into the vocabulary: DOM-sourced kb/mouse edges come from new engine-level
edge detection (§4.6); gamepad is polled and edges are **synthesized**, including
**persistent DAS/repeat timer state** (held direction → first move, pause,
auto-repeat) that lives on the normalizer across frames (it cannot live in the
per-frame buffer). The analog stick collapses to 4-way `focusmove` (an accepted
loss). Sampling happens at the top of the tick so dispatch is **same-frame** (no
+1-frame latency).

**§4.3 Dispatch, focus, pointer.** `engine/ui/input/event-dispatcher.ts` resolves
targets and runs **capture → target → bubble** with `stopPropagation`/consumption,
invoking node handlers (`onClick`/`onFocus`/`onKeyDown`/…).

- `engine/ui/input/pointer-router.ts` transforms `Mouse.position` into UI space
  (÷ uiScale, matching paint) and hit-tests **top-most** against Yoga rects (from
  the previous frame's committed layout) → hover/press/click; a pointer hit also
  sets focus. Clip/scissor regions (§6) bound hit-testing for scrolled content.
- `engine/ui/input/focus-nav.ts` is the self-written focus/nav system over the
  node tree: focusable nodes register (rect from Yoga + group membership);
  directional resolution ports the **W3C Spatial Navigation** scoring; **focus
  groups**, **explicit neighbor overrides**, **focus trap** (modals), **focus
  memory** (restore last selection). Driven by `focusmove`/`confirm`/`cancel`
  events. Traversal is deterministic → unit-tested ("from X, press right → Y").
- Handler-authoring note: `onClick`/`onKeyDown` here are **not** react-dom
  `SyntheticEvent`s (a custom reconciler ships no event system); the dispatcher is
  mandatory, not a reinvention. A naming/doc convention flags that `preventDefault`
  and passive-listener semantics do not exist.

**§4.4 Consumption & passthrough (masked Input view).** During dispatch the
dispatcher records which raw input tokens it consumed. `engine/ui/input/
masked-input.ts` produces a **filtered view** of `Input` with consumed tokens
suppressed; gameplay reads this view. Consumption is per-token: pointer over any
UI element consumes the pointer (never reaches world pickers like `bow-system`);
a focused widget consumes only the keys it handles. **Modal** capture is the
degenerate full mask (suppress everything) and composes with scene-push. This
filtered-view mechanism supersedes the editor `RunSession` binary swap (which is
editor-layer and cannot be reused); the swap is just the modal case.

**§4.5 Frame slot & the single commit.** In a fixed slot in `engine/game.ts`,
wrap the UI mutation phase in `reconciler.flushSyncFromReconciler(fn)`:

```
input.update()                       // sample devices (top of tick)
flushSyncFromReconciler(() => {
  uiInput.dispatch()                 // normalize → hit-test/focus → capture/bubble
                                     //   → handler setStates; record consumed set
  const masked = maskedInput(consumed)
  sceneManager.update(masked)        // gameplay reads masked view; enqueues UI intents
  uiIntents.drain()                  // apply game→UI intents (setState/store writes)
})                                   // ← exactly one synchronous commit here
sceneManager.render(renderer)        // paint walks the freshly-committed tree + dyn
renderer.endFrame()
uiEvents.clear(); sceneManager.clearEvents(); events.clear()
```

Dispatch must run **before** gameplay update so the mask is ready; the single
commit folds in both the early handler `setState`s and the late intent applies
(spike-validated: coalesces across the synchronous gameplay gap into one commit).
`setState` in handlers is unrestricted; the intent queue is used **only** for
game→UI updates (cross-layer, outside React). Never call `flushSync`/
`updateContainerSync` mid-region (it re-splits the commit); `updateContainer` is
used once, at mount.

**§4.6 Engine input additions.** Add frame-level **edge detection** to
`engine/input` (prev/curr snapshot → "just pressed"), consumed by both focus-nav
and pointer press. This also lets the existing hand-rolled edge-detect sites
(dialogue, interaction, player-intent) migrate to a shared source over time.

### §5 Bypass channel & anchor system

`engine/ui/bypass/dyn-store.ts` holds per-frame values keyed by node. The anchor
system (`engine/ui/bypass/anchor-system.ts`) runs per frame (zero reconcile): for
each world-anchored node, project the entity's world position to UI space with a
**scalar/in-place camera transform** (§6) → on-screen test → write `dyn` position;
off-screen markers clamp to a screen-inset rect and set `rotation = atan2` toward
the true target. Anchored position is a **post-layout offset, never a Yoga input**,
so entity/camera motion never triggers relayout.

### §6 Renderer & camera additions (additive)

- **Scalar/in-place `worldToScreen` in `engine/camera`** — the anchor path needs a
  non-allocating projection (out-param or scalar returns); the existing
  `Camera2D.worldToScreen`/`screenToWorld` allocate a `Vector2` per call. Phase-1
  prerequisite.
- **Scissor/clip stack** in `Renderer2D` — for `overflow:hidden`/scrolling
  (inventory, dialogue history, long quest lists). New stateful `LayerCommand`
  that breaks the batch, converts the clip rect from virtual UI space → FBO pixels
  (× uiScale, Y-flip), maintains a push/pop intersection stack. No shader change;
  rotated clips out of scope.
- **Per-draw alpha** — add an `alpha?` field to `DrawRectOpts`/`DrawTextOpts` for
  ergonomics (images/tiles already carry tint/alpha).
- **Group/subtree opacity** — deferred (see Risks): start per-leaf; add a
  subtree→FBO isolation path only if a screen needs uniform panel fade.

### §7 Styling, grid, panels, text components

`engine/ui/style/` resolves typed style props to Yoga inputs + paint attributes.
`engine/ui/components/`: `<Grid columns cellSize gap>` (flex/absolute under the
hood), `<Panel>`/`<NineSlice>` (wrap `drawNineSlice`), `<RichText>` (per-glyph
color/wave/style via the bypass), `<Overlay>` (full-screen, bypass alpha).

### §8 Delivery phases

**Phase 1 — Foundation (front-load the risky, bespoke seams).**

1. Reconciler host + node model + keyed-write `commitUpdate`; the
   `flushSyncFromReconciler` frame slot (§4.5) + intent queue; paint render system
   (merged field-read).
2. `yoga-layout` dep; Yoga create/free lifecycle; measure via shared wrap; flex +
   absolute/anchor. Leak test.
3. Bypass `dyn` channel + scalar/in-place `worldToScreen` (§6) + anchor system
   (edge-clamp, point-toward, overflow/fallback).
4. Renderer additive items: scissor clip stack; per-draw alpha fields.
5. **Event/input layer (§4):** engine edge detection; UI-event vocabulary +
   ordered/consumed buffer; normalizer (incl. gamepad DAS); dispatcher with
   capture/bubble/consumption; pointer router; focus/nav (W3C port, groups,
   overrides, trap, memory); masked-input arbiter + modal full-mask.
6. CSS-in-TS style model; `<Grid>`, `<Panel>`/`<NineSlice>`, `<RichText>`,
   `<Overlay>`.
7. `react-reconciler` → `package.json` `dependencies`. Verify/exclude the
   `engine/ui` slice under the React Compiler (§Risks).

**Phase 1 checkpoint (go/no-go):** build two reference screens end-to-end in the
real app and drive them live — a **pause menu** (focus/gamepad nav, modal capture)
and an **inventory grid** (grid layout, scrolling/clip, pointer + focus,
per-token passthrough while a non-frozen game runs behind if that toggle is
chosen). The focus/nav + input layer is the likeliest timeline risk, so it must
run before any migration.

**Phase 2 — Incremental migration** (new system alongside old; delete each old
system as its replacement ships):

| Element             | Today                                                                        | New                                                                                                                | Improvement                                                                         |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Screen fade         | full-screen rect                                                             | `<Overlay>`, bypass alpha                                                                                          | trivial; shake-out target first                                                     |
| Death overlay       | full-screen                                                                  | `<Overlay>` + focusable Respawn                                                                                    | gamepad-navigable                                                                   |
| Dialogue box        | nine-slice + rich text, typewriter, per-glyph wave; keyboard-only choice nav | `<Panel>`+`<RichText>`; choices are focusables with `onClick`/`confirm`                                            | validates RichText + focus + event dispatch; choices gamepad- and pointer-navigable |
| Quest tracker       | manual y-stacked text                                                        | `<QuestTracker>` (flex)                                                                                            | add/remove animates via bypass                                                      |
| Quest notices       | popup                                                                        | `<Notice>` w/ enter/exit transition                                                                                | transition via bypass                                                               |
| Health bars         | world `drawRect`                                                             | anchored `<HealthBar>`                                                                                             | fill + pos via bypass                                                               |
| Quest markers       | bobbing chevron, no projection                                               | anchored `<Marker>`                                                                                                | **edge-clamp + point-toward off-screen entity**                                     |
| Interaction hints   | world                                                                        | anchored `<Hint>`                                                                                                  | overflow-aware placement                                                            |
| Hitsplats           | per-hit spawn/draw                                                           | anchored, **pooled**                                                                                               | zero-reconcile/zero-GC in combat                                                    |
| Pause / main menus  | (none)                                                                       | new screens                                                                                                        | full focus/nav                                                                      |
| Save / load menus   | **React/react-dom (base-ui) DOM stopgap** shipped by the Phase-5 game shell  | `engine/ui` screens: main menu (New Game/Continue/Load), in-game save/load slot list, quicksave/quickload feedback | pixel-crisp, gamepad-navigable, no DOM overlay                                      |
| Inventory / toolbar | (none)                                                                       | grid screens                                                                                                       | grid + clip + pointer/focus + passthrough                                           |

**Added 2026-07-12 (persistence/save foundation).** The standalone game shell
(`2026-07-12-feature-persistence-save-foundation.md`, Phase 5) shipped its save/load/
main-menu UI as **React + react-dom (base-ui) DOM elements** — a deliberate **stopgap**,
and a violation of this plan's core "no DOM/React-DOM overlay" decision (its anti-aliased
DOM text clashes with the pixel-art canvas, and it re-introduces the DOM overlay this layer
exists to remove). It must be re-authored as `engine/ui` screens once this foundation lands:
the main menu (New Game / Continue / Load), the in-game save/load slot list, and
quicksave/quickload feedback. The underlying `SaveDriver` API is UI-agnostic, so only the
view layer is replaced — no save-logic change. Track it as part of the Phase-2 migration
(row above). Do not build further game menus on react-dom.

Suggested order: screen fade → death overlay (shake-out) → dialogue (richest;
first real event-driven interaction) → quest tracker/notices → world-anchored
(health bars → markers → hints → hitsplats). Menus/inventory are the Phase-1
reference screens. Each migrated screen-space system also drops the hardcoded
`UI_SCALE` for `scene.config.uiScale`.

**Phase 3 — Cleanup.** Lint rule for the no-spread-merge invariant; tests (focus
traversal, bypass survival, Yoga leak, one-commit-per-frame, per-token
passthrough). Migrate remaining hand-rolled edge-detect sites to the shared
source where sensible.

## Research findings that drove this

**Codebase precedents.**

- `engine/events.ts` is a broadcast, non-consuming, per-frame buffer with multiple
  readers per event type (`DamageEvent` ×4, `DeathEvent` ×2) — wrong contract for
  input routing; drove the UI-owned ordered/consumed buffer (Alternatives).
- `blocksInputBelow` (`scene/scene-manager.ts`) is a query helper `update()` never
  calls; `RunSession`'s whole-`Input` swap is editor-layer — drove the
  engine-level masked-input arbiter as the load-bearing mechanism (§4.4).
- Dialogue selection (`dialogue-system.ts`) — keyboard poll + manual edge-detect +
  manual consume, selection on a component read by a paint system — is the
  existing proxy for event-driven focus/nav and the first migration validator.
- Mouse picking exists only in the editor via allocating `Camera2D.screenToWorld`;
  no in-game hit-testing or edge detection exists — drove §4.6 and the scalar
  camera projection (§6).
- Hardcoded `UI_SCALE` in current UI render systems — drove the `uiScale`
  migration note.

**Spike evidence (spikes were run to validate; the throwaway code has since been
removed — the findings are recorded here, no code to point at).**

- **Reconcile throughput** (React, 250-node UI, prod build): full-rerender p99
  1.68ms; realistic one-cell p99 0.17ms; idle bailout ~0.03ms; zero frames over
  8.33ms.
- **React vs Solid** (identical plain-object backend): one-cell React ~13.8 B/
  update, V8 GC max 0.8–2.7ms; Solid 0 B, GC max ~0.18ms. Basis for the disjoint-
  bypass invariants and the Solid trade-off note.
- **World-anchored + pooled bypass** (150 entities / 901 nodes): disjoint bypass
  survives an unrelated reconcile (pass); per-frame anchoring incl. edge-clamp +
  atan2 = 0 reconciles, 0 host ops, 0 bytes/frame, ~0.01ms/frame; hitsplat pooling
  = 0 reconciles/0 GC (vs naive 30 reconciles/s, 2.7ms pause). Entity streaming is
  the GC hotspot (~1.19ms max pause at 10/s) → pool anchored subtrees if streaming
  scales.
- **Per-frame commit control** (React 19.2 + `react-reconciler@0.33.0`,
  `LegacyRoot`, custom plain-object host — re-run for this revision): a legacy-root
  `setState` does **not** flush at the call site; React schedules and coalesces
  default-priority updates. `flushSyncWork()` is insufficient (flushes only
  sync-lane work). `flushSyncFromReconciler(fn)` coalesces every `setState` made
  inside `fn` — **including across a synchronous "gameplay" gap** — into exactly
  one synchronous commit, measured before the following statement. This pins §4.5
  and §Decision-9, refutes the earlier assumption that a legacy root would flush
  N times mid-frame, and dissolves the mid-bubble use-after-free concern (a
  handler `setState` during the capture/bubble walk does not commit synchronously
  mid-walk).

## Risks & open questions

- **Bespoke surface area is the top risk** — reconciler host + Yoga glue + measure
  parity + focus/nav + the event/consumption layer + paint + a 10-system migration
  is a lot of net-new engine code. Mitigation: front-loaded reference screens
  (Phase-1 checkpoint); incremental migration keeps old UI working throughout.
- **Focus/nav + event/consumption is the likeliest timeline-killer** — the one
  area with no existing scaffolding. The Phase-1 checkpoint exercises it before any
  migration commits.
- **Discipline invariants must be enforced mechanically** (types/lint/tests), or
  the "React is viable" case erodes:
  1. Disjoint bypass ownership — a value is React-owned or `dyn`-owned, never both.
  2. Paint field-reads the merged view; **never** `{...props, ...dyn}` (lint).
  3. Pool anything that spawns/despawns hot (hitsplats; anchored subtrees if entity
     streaming scales).
  4. All UI state changes ride the one `flushSyncFromReconciler` region per frame;
     no `flushSync`/`updateContainerSync` mid-region; handler `setState` is fine,
     game→UI goes through the intent queue.
  5. Yoga `create()`/`free()` paired in the host (leak test).
  6. World-anchored position is a post-layout offset, not a Yoga input.
- **React Compiler interaction.** `babel-plugin-react-compiler` is enabled; its
  auto-memoization can conflict with the manual bypass/mutation channel. Phase 1
  must verify the `engine/ui` slice under the compiler or exclude it — resolve
  before shipping the host.
- **Freeze-behind is a deferred design decision** (per screen): whether gameplay
  `update()` runs behind open non-modal UI. The architecture supports both;
  which each screen uses is chosen when the screen is built (a UX decision, not
  ours to preset).
- **Group/subtree opacity** (deferred): start per-leaf alpha; decide whether
  whole-panel uniform fades warrant the FBO-isolation path once a real screen
  needs it.
- **`flushSyncFromReconciler` frame-slot wrapping gameplay update.** The validated
  pattern wraps `sceneManager.update()` inside the flush region (harmless —
  gameplay makes no React calls). If Phase 1 prefers to keep gameplay outside the
  React execution context, confirm that a trailing `flushSyncFromReconciler(()=>{})`
  still force-flushes `setState`s scheduled earlier in the tick before adopting
  that variant. Not a blocker; the wrap-the-phase pattern is proven.
