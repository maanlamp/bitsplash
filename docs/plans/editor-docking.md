# Editor Docking & Panels — Architectural Plan

Status: **planned** (no implementation yet). README has the summary; this is the
pick-up brief. This is the largest single editor change.

## 1. Goal

Replace the flat 3-region layout (and `react-resizable-panels`) with a hand-rolled
recursive docking workspace on **motion/react**: tabbed, splittable, drag-dockable
panels with robust persistence, and multiple scene viewports side-by-side.

## 2. Where we are today (`editor/app.tsx`)

- Flat `PanelView.Group` (horizontal): `tree (300px) | canvas (flex) | inspector
(300px, only when an entity is selected)`. `react-resizable-panels` with
  `defaultLayout`/`onLayoutChanged` → localStorage (`"editor-layout"`).
- **One** `FantasyPlatformer` + **one** `<canvas>` attached to `mountRef`.
- The center panel **mode-switches**: it shows the world viewport _or_ an asset
  editor (sprite/font/audio), chosen by **react-router** (`/asset/:name`) +
  `selectedAsset`/`creating` state. Opening an asset _replaces_ the world view —
  you can't see a sprite and the scene at once.
- Editor systems (`EditorCamera2DSystem`, `TileEditorSystem`,
  `EntityEditorSystem`, highlight/preview/grid) are added to the single ECS;
  `setEditorSystemsActive` toggles them; `play()` goes fullscreen + simulates.
- Unsaved-changes guard (`guardDiscard` + `ConfirmDialog`) gates view switches via
  a single `assetDirtyRef`.
- Known pain (user): persistence is **broken**; the lib forced bandaid fixes
  (e.g. the `disableCursor` workaround noted in the style guide); rip it out.

## 3. Locked decisions

1. **Full recursive split-tree layout**, hand-rolled.
2. **View registry + co-openable tabs**; **drop react-router** as the view
   selector — open views are layout state.
3. **One `Renderer2D`/WebGL context per scene viewport** in the editor.
4. **motion/react** for drag, splitter resize, dock animations (no resize lib).
5. **Robust versioned persistence** (validate-on-load, drop dangling views).

## 4. Layout model

```
type LayoutNode =
  | { type: "split"; direction: "row" | "column"; sizes: number[]; children: LayoutNode[] }
  | { type: "tabs"; views: ViewId[]; active: ViewId }

type Workspace = { version: number; root: LayoutNode; focused: ViewId | null }
```

- N-ary splits (sizes are fractions summing to 1) render as flexbox; resizing a
  divider redistributes between the two adjacent children.
- `tabs` leaves hold an ordered list of `ViewId`s + the active one.
- The whole `Workspace` is JSON-serializable → localStorage.

## 5. Views & registry

```
type ViewDef = {
  match: (id: ViewId) => boolean   // or a type prefix
  title: (id: ViewId) => string
  icon: ...
  render: (id: ViewId) => ReactNode
  closable?: boolean
  isDirty?: (id) => boolean        // for close-guard
}
registerView(def)
```

- `ViewId` encodes type + params: `tree`, `inspector`, `assets`, `perf`,
  `scene:<sceneId>`, `sprite:<url>`, `audio:<url>`, `font:<url>`, plus future
  `anim:<url>`, `ai-debug`, etc.
- Singletons (`tree`, `inspector`) appear once; parameterized views can have many
  instances.
- **Opening** a view = insert its id into the focused (or a target) `tabs` node +
  set active. **Closing** = remove (run `isDirty` close-guard first). Today's
  `creating`/route-driven asset open becomes "open a `sprite:`/`audio:` view."
- The unsaved-changes guard moves **per view** (closing a dirty editor tab
  prompts), replacing the single `assetDirtyRef`.

## 6. Drag-to-dock (motion/react)

- **Tab reorder within a group:** motion `Reorder.Group`/`Reorder.Item`.
- **Tab drag-out / dock:** drag a tab with `dragControls`; on drag, hit-test the
  pointer against measured leaf-region rects (refs + `getBoundingClientRect`) and
  the sub-zone within (center / N / S / E / W). Render a highlighted drop overlay.
  On drop:
  - center → append the view to that region's `tabs`.
  - edge → wrap that region in a new `split` (direction from edge) with the
    dragged view as a new sibling `tabs`.
  - dropping the last tab out of a region prunes the empty node + collapses the
    parent split (renormalize sizes).
- **Splitter resize:** a divider element per split gap; motion `drag` constrained
  to the split axis; updates `sizes[]`. Replaces `react-resizable-panels`
  entirely (and its `disableCursor` hack — set resize cursors ourselves).
- **Reflow:** `layout` prop on panels animates resize/dock changes; respect the
  motion tokens (`--duration-fast`, `--ease-standard`).
- Tree mutations are pure functions over `LayoutNode` (insert/move/remove/split/
  prune) — unit-testable, decoupled from the drag UI.

## 7. Scene viewports & rendering

- A `scene:<id>` view mounts a `<canvas>` + its own `Renderer2D` (own WebGL
  context), rendering that scene from the `SceneManager` via `renderScene`
  (see `scenes.md` §4.5). Mount on tab open, dispose context on close.
- The single `FantasyPlatformer`/viewport becomes **one scene-viewport view among
  many**. (Depends on the Scene system landing.)
- **Focused viewport** drives editor tooling: `EditorState` (mode/selection) is
  shared, but tile-paint / selection / camera systems target the focused scene's
  world. On focus change, re-target (or run per-viewport editor-system sets).
- **Input:** each scene canvas handles its own pointer events feeding the focused
  scene's editor systems (today there's one `Input` on one viewport; this becomes
  per-canvas pointer handling for editor interactions).
- Multiple contexts duplicate GPU textures — fine: the editor is not
  memory-budgeted (`editor-vs-runtime-separate`). Runtime split-screen remains the
  separate one-context/multi-camera path.

## 8. Persistence (first-class rebuild)

- Serialize `Workspace` to localStorage on every layout mutation (debounced),
  ourselves — not via a lib callback.
- On load: parse → **validate** every `ViewId` against the registry + live
  targets (scene/asset still exists?); drop invalid ids and prune empty nodes
  rather than crashing. Renormalize sizes.
- `version` field → a small migration step when the layout schema changes.
- Fall back to a sane default workspace if parse/validation fails entirely.

## 9. Active views + per-view chrome (NOT a global topbar)

A global undo/redo bar was tried and **rejected** — routing one undo control to
whatever view happens to be focused is a confusing interaction mode. The model is
instead **active views**:

- **One active view** (`workspace.focused`). Clicking a tab _or_ a view's content
  activates it (`tabs.tsx`: `onPointerDownCapture` → `activate`, guarded so it's a
  no-op when already focused). The active leaf gets a subtle accent ring.
- **Keyboard is scoped to the active view.** Every view registers its hotkeys with
  react-hotkeys-hook `{ enabled: active }`, so only the focused editor responds.
  This is what makes the always-mounted views safe (sprite tool keys no longer
  fire while the scene is focused, etc.). The scene hotkeys in `app.tsx` stay
  guarded by `assetFocused()`.
- **Undo/redo is per-view.** Each view owns its own `History`; its `mod+z`/`mod+y`
  and its toolbar buttons act only when active. Scene history lives in `app.tsx`;
  sprite/audio document history in `useDocumentEditor` (gains an `active` flag that
  enables its undo hotkeys). There is **no** `ActiveUndo` store and **no** top bar.
- **Per-view tools, one floating-toolbar pattern.** A shared `FloatingToolbar`
  (`floating-toolbar.tsx`, glassy bottom-centre) hosts each view's own tools:
  game view (undo/redo + play + modes), sprite editor (undo/redo + colour + draw
  tools), audio editor (undo/redo + tools + transport). **Play is a game-view
  tool**, not global.
- **`PerfMonitor` as a dockable `perf` view — still deferred** (no view-opener).
- **Open:** the per-editor document top bars (filename + Save) and the font view's
  relocated controls don't fit the tab paradigm yet — Save/title should integrate
  with the tab strip. Deferred.

## 10. What gets removed

- `react-resizable-panels` dep and all `PanelView.*` usage, `loadLayout`/
  `saveLayout` (its `Layout` type), `disableCursor`, the `.resizeHandle` styling
  tied to it.
- The `⚠️ disableCursor` caveat in the Editor Style Guide (delete when the lib is
  gone).
- react-router as the editor view selector (keep only if still wanted for
  deep-linking; layout state otherwise subsumes it).

## 11. Migration path

1. Build the `LayoutNode` model + pure tree-mutation fns + a renderer that lays
   out splits/tabs (static, no drag yet) — port the current 3 panels into a
   default workspace. Remove `react-resizable-panels`.
2. Splitter resize via motion drag; correct + robust persistence.
3. View registry; convert tree/inspector/canvas/asset-editors into registered
   views; drop the route-driven center mode-switch; per-view dirty guard.
4. Tab strips + reorder + drag-to-dock + drop zones + node prune/collapse.
5. Scene-viewport view with its own `Renderer2D`; focus-driven editor tooling
   (depends on Scene system). Until scenes land, keep the single world as one view.
6. Active-view model (see §9): clicking a tab/content activates a view; keyboard +
   per-view undo/redo are scoped to the active view. Per-view tools (incl. play and
   each view's own undo/redo) share the floating-toolbar pattern. No global topbar.
   Perf-as-view still deferred (no view-opener yet).

## 12. Open sub-decisions / handoffs

- **Depends on the Scene system** for real multi-viewport (step 5); steps 1–4 are
  independent and can land first.
- **Per-canvas input** routing for editor interactions across viewports — design
  with step 5.
- **Float/detached windows** (popout panels) — out of scope; revisit if needed.
- **react-router**: confirm full removal vs keep for asset deep-links.

## 13. Primary files touched

- New: `editor/workspace/layout.ts` (model + mutations),
  `editor/workspace/Workspace.tsx` (renderer), `editor/workspace/Tabs.tsx`,
  `editor/workspace/Splitter.tsx`, `editor/workspace/dock-zones.ts`,
  `editor/workspace/view-registry.ts`, `editor/workspace/persist.ts`,
  `editor/views/*` (scene/sprite/audio/tree/inspector/perf view wrappers).
- Changed: `editor/app.tsx` (collapse into the workspace host), removal of
  `react-resizable-panels`, `editor/styles/layout.module.scss`, the style-guide
  `disableCursor` note.
