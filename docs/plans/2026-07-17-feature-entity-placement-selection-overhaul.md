# Entity Placement & Selection Overhaul

- **Type:** feature
- **Date:** 2026-07-17
- **Status:** accepted

## Goal

Give the editor a Figma-grade entity placement and selection experience:
per-scene multi-select on a clean event-driven substrate, unified grid +
smart-guide snapping, drag-from-browser placement, `Alt`-drag duplication,
multi-edit in the inspector, a non-laggy spatial-index picker, and a single
cursor authority. Removes roadmap bullets 6 (entity placement) and 7
(selection/inspector) wholesale.

## Context & problem

Today the editor's scene-view interaction layer is a pile of independent,
partly-contradictory mechanisms:

- **Selection** lives in a per-scene `EditorState` (`src/editor/editor-state.ts`,
  hand-rolled `Subscribable` + `useSyncExternalStore`), keyed by scene id in
  `src/editor/project.ts:63`. It is scalar (`_selected: EntityId | null`) — no
  multi-select anywhere. The single inspector is fed by `App` recomputing a
  "focused winner" store from `workspace.focused` on **every render**
  (`src/editor/app.tsx:249-277`). Roadmap bullet 7's "one global inspector
  weirdness."
- **Snapping** has three inconsistent conventions with no shared helper: create
  snaps the pivot to a grid **corner** (`Math.round`, `scene-view-panel.tsx:25`),
  drag snaps to cell **center** (`Math.floor+TILE_SIZE/2`, `entity-editor.ts:15`),
  and the inspector doesn't snap at all (`commands.ts:178`). The two drag/create
  models are offset half a tile from each other.
- **Picking** (`src/editor/pick.ts`) loops every entity and recomputes geometry
  + async image lookups + `Vector2` allocations on every hover frame, with no
  cache and no spatial index — the roadmap's "freezes for tens of ms on hover."
  It also picks in pan mode (before the mode early-return, `entity-editor.ts:46`).
- **Cursor** is a bolted-on `useEffect` (`src/editor/app.tsx:761`) toggling
  SCSS-module classes on only the focused viewport, reflecting only
  `mode==="pan"`. The sprite editor has a separate `cursorForTool` path
  (`src/editor/sprite/sprite-tools.ts`). No shared authority.
- **Placement** is context-menu only; the `"scene-view"` drop target exists
  (`src/editor/asset-drop-registry.ts:12`) but has no handler. **Duplicate**
  exists (`commands.ts:48`) but is context-menu only — no `Alt`-drag.

**Constraints that bound the solution:**

- **Layers**: Editor may import Engine, never Game (AGENTS.md). The prefab
  registry (`src/game/prefabs.ts`) and `spawnPrefab` are Game-layer — the editor
  cannot call them. Prefab drop must read the `.prefab.json` as authored data.
- **Serialization provenance**: authored `*.scene.json` is produced only by
  `SceneDocument.save()` replaying the journal onto a scratch world. Selection
  is not an ECS component and is never serialized — verified provenance-clean.
- **ECS**: behavior in systems; no entity hierarchy; `@serializable`/`@serialize`
  registry drives the inspector.
- **UX rule**: player-facing game UI has no sliders; this is editor UI, exempt.
  Configurable nudge/snap values are editor settings.

## Decision

Build it as six workstreams over a shared substrate. The spine:

1. **Selection is per-scene**, not per-view. An event-driven **active-scene
   service** holds the focused scene id; a single **selection channel** mirrors
   the active scene's selection *and carries the source document + ecs* so the
   inspector can resolve bindings. The scalar `_selected` becomes
   `{ ids: Set<EntityId>, anchorId: EntityId | null, primaryId: EntityId | null }`.
2. **Multiple-views-of-one-scene is removed** (subtractive) so "per-scene" and
   "per-view" coincide — no selection ambiguity, undo-reselect is well-defined.
3. **Picking** gets a cached per-entity world AABB (dirty-flagged, since ECS
   emits no field-mutation events, the *mutating systems* mark dirty) plus an
   `rbush` R-tree broad-phase → narrow-phase exact test reproducing today's
   topmost-hit semantics. The index is per-world and full-rebuilt on churn.
4. **Snapping** unifies on one bounds-aware resolver: ON by default, momentary
   `Ctrl`-escape, sticky magnet toggle; grid-feature snap + proximity object
   smart-guides. Stored positions are **not** migrated.
5. **Cursor authority**: one engine primitive (priority + disposable tokens,
   inline `style.cursor`, per-surface) replacing both the scene-view effect and
   the sprite editor's path.
6. **Placement/duplication/multi-edit** built on 1–5: an extensible scene-view
   drop registry, `Alt`-drag duplicate with body teleport, and inspector
   multi-edit wrapped in composite journal entries with **poke-aware routing**.

Rationale: the substrate items (1–3, 5) are the load-bearing correctness pieces
and were the source of every critical critique finding; the UX items (4, 6) sit
on top and are mostly mechanism once the substrate is right.

## Alternatives considered

- **Per-view selection** (VS Code/Theia model). Rejected: contradicts the
  per-document shared journal (undo-reselect has no unambiguous target view when
  two views of one scene differ), and the project tree keys `entity:${sceneId}:${id}`
  collide across views. The multi-view capability that justifies it is unreachable
  in the UI (`openScene` always opens the primary; `nextSceneViewId` is
  test-only). Per-scene + removing multi-view is strictly simpler and correct by
  construction.
- **Full group transform** (resize/rotate a multi-selection). Deferred:
  rotation/non-uniform scale of many entities raises hard semantics; move-together
  covers the authoring need.
- **GPU color-buffer picking.** Rejected: Canvas2D, readback stalls; a spatial
  index gives the same answer without a GPU pipeline.
- **One-time snap migration pass.** Rejected: mass diff across every scene file,
  entities shift without being touched. Leave stored positions; re-snap only on
  active drag.
- **Repeat-with-same-delta** and **type-exact-value mid-drag**. Cut by user:
  not wanted; precision comes from inspector fields.

## Approach / steps

Workstreams **A–D** are the foundation and share three contracts; **E, F**
build on them. **B** (remove multi-view) is subtractive and unblocks A; do it
first. Once the contracts below are agreed, **A, C, D** can proceed in parallel.
**E** (snapping/manipulation) depends on A (selection set), C (the `pick-index`
for marquee + smart-guide neighbor queries), and D (drag cursor). **F**
(placement/multi-edit) depends on A + C (drop-point snap) + the composite-routing
step.

**Shared contracts (agree before parallel work):**
- **`EntityAabb`** — one canonical world-space AABB per entity `{minX,minY,maxX,maxY}`,
  the single bounds definition used by picking, snapping, highlight, and marquee.
- **Selection shape** — `{ ids: Set<EntityId>, anchorId, primaryId }`, plus a
  `version: number` for `useSyncExternalStore` snapshot stability.
- **Selection channel payload** — `{ selection, document, ecs }` (ids are
  meaningless without their owning world).

### Workstream A — Selection substrate (line 7)

1. Replace `_selected: EntityId | null` in `src/editor/editor-state.ts` with the
   selection shape + `version`; add `select(ids, {anchor, primary})`,
   `addToSelection`, `toggle`, `clear`, `selectRange(anchor→target)`. Keep
   `inspectingWorld`/`mode`/`hovered`/`activeLayer` on the same per-scene store
   (they stay coupled to selection via `setSelected`/`inspectWorld`).
2. Add an **active-scene service** (new `src/editor/active-scene.ts`,
   `Subscribable`): holds the focused scene id, updated event-driven from
   `workspace.focused` (replace the per-render derivation in `app.tsx:249-277`).
3. Add a **selection channel** the inspector subscribes to — a derived
   `Subscribable` combining active-scene + that scene's `EditorState` selection,
   emitting `{ selection, document, ecs }` once per change.
4. Rewire readers to the set: `EntityHighlightSystem`
   (`src/editor/systems/entity-highlight.ts`) renders an outline per selected id
   + the primary distinctly; `EntityEditorSystem` (`entity-editor.ts`) picking
   writes via the new mutators (shift-click toggle, plain click replaces);
   `NavGraphDebugSystem.selectedProfile` reads `primaryId`.
5. Project tree (`src/editor/project-tree.tsx`): `selectedKeys` becomes the full
   id set; `onSelectEntity` supports shift/ctrl add/range.
6. Hotkeys (`app.tsx`): `Ctrl+A` select-all-in-scene, `Shift+Ctrl+A` invert,
   `Escape` clear, `Delete` deletes the whole set (composite).
7. `useSyncExternalStore` safety: `useEditorValue` selectors return primitives or
   `has(id)` booleans or the `version` counter — **never** a freshly-built array
   from `getSnapshot`. "Common fields across selection" is memoized outside the
   snapshot.

### Workstream B — Remove multi-view-of-one-scene (subtractive)

1. Delete `nextSceneViewId` and the view-id suffix stripping in
   `src/editor/workspace/view-registry.ts:56-62`; `openScene` (`app.tsx:519`)
   enforces one view per scene (focus the existing view if already open).
2. Delete/repurpose `test/scene-view-identity.test.ts`.
3. This makes per-scene selection unambiguous; do it before/with A step 3.

### Workstream C — Picking rewrite (perf)

1. New `EntityAabbSystem` maintaining a per-entity cached `EntityAabb`. Since ECS
   `notify()` fires only on create/add/remove and carries no id
   (`src/engine/ecs.ts:76`), and transform writes are silent
   (`entity-editor.ts:89`), the systems that mutate transform/sprite **explicitly
   mark the entity dirty** (drag, nudge, inspector commit, duplicate, drop). AABB
   recomputed only for dirty entities per frame.
2. Add `rbush` dependency; wrap it in `src/editor/pick-index.ts` owned **per
   world**. Incremental `remove`+`insert` for dirty/created/destroyed entities;
   **full `clear()`+`load()` rebuild** at every mass-churn site:
   `SceneDocument.rebuildLive` / `revert` (`world.clear()`+`deserializeWorld`),
   undo/redo replay (`journal-entry.ts` `applyEntry`), run-host world swap
   (`app.tsx:683`). The focused view picks against its shown world's index.
3. Rewrite `pickEntityAt` (`pick.ts`): broad-phase `index.search(cursorBbox)` →
   narrow-phase exact test on candidates, reproducing the current
   smallest-area-piece topmost-hit semantics (`pick.ts:107-119`) across the
   candidate set. No per-frame geometry/image recompute.
4. Gate picking on `mode === "select"` **before** any hit-test (move the check
   above the hover pick at `entity-editor.ts:46`) so pan mode never hit-tests.

### Workstream D — Cursor authority

1. New engine primitive `src/engine/cursor/cursor-authority.ts`: sources
   `request({cursor, priority})` → disposable token; the authority resolves the
   highest-priority live token (ties: most-recent) and writes the winning cursor
   via **inline `style.cursor`** to a target element, **per surface** (each
   `Viewport.element`, sprite canvas, texture panel, loupe). `none` implements
   the current `hidden` semantics; the sprite brush overlay keeps its paired
   drawing, requesting `none` while active.
2. Migrate scene-view sources: pan (grab/grabbing), active drag, hover-over-entity
   (move), marquee. Replace the `app.tsx:761` effect and `src/editor/cursor.ts`.
3. Migrate the sprite editor's `cursorForTool`
   (`src/editor/sprite/sprite-tools.ts`, `game-view-panel.tsx`, `texture-panel.tsx`)
   onto the authority.

### Workstream E — Snapping + manipulation (line 6)

1. One snap resolver `src/editor/snapping.ts`: `snap(entityAabb, worldPoint,
   ctx)` returning a snapped position. Bounds-aware — snaps the nearest salient
   point of `EntityAabb` (corners/edge-mid/center) to the nearest grid feature;
   geometry-less entities degrade to pivot. Snapping ON by default; **sticky
   magnet toggle** on the per-scene store; momentary `Ctrl` escapes it (reads
   modifier robustly — see step 4). Snap computed at drag/drop commit; no
   retroactive move when an image loads later. **Remove** the three old snap
   helpers and the `Shift`=snap code (`entity-editor.ts:88`, `scene-view-panel.tsx:25`).
2. Proximity object smart-guides: query `pick-index` for neighbors within a snap
   threshold; align moving entity edges/centers to neighbor edges/centers; render
   live alignment lines (new render pass in the scene view). Same resolver, `Ctrl`
   escapes both.
3. Drag/move rewrite (`EntityEditorSystem` + `finishDrag`): support an N-entity
   move — capture per-entity origins, translate the whole set by one delta,
   snap the group, commit as one `composite` journal entry. Preserve the physics
   body teleport + velocity zero (`entity-editor.ts:91-102`) for every moved
   entity. Marquee (intersect) box-select via `pick-index.search(boxBbox)`.
4. Modifier robustness: the drag uses pointer capture and reads modifier state so
   focus-loss mid-drag doesn't wipe it (today `keyboard.ts:71` `onBlur` clears
   `keys.CTRL`). `Ctrl+D` duplicate stays on the window-level `react-hotkeys-hook`
   path (`app.tsx:860`); in-canvas chords (`Shift+Ctrl+arrow`) get explicit
   edge-detection bookkeeping the input layer lacks.
5. `Alt`-drag duplicate: on drag-start with `Alt`, duplicate the selection first,
   select the copies, then drag them. Fix `duplicateEntity` (`commands.ts:48`) so
   the new physics body is teleported to the offset transform (today body starts
   at the pre-offset authored position).
6. Nudge: arrow = 1 unit, `Shift`+arrow = N (a configurable editor setting),
   `Shift+Ctrl`+arrow = one grid cell. Marks moved entities dirty.

### Workstream F — Placement + inspector multi-edit

1. Extensible scene-view drop registry: register `"scene-view"` handlers per
   asset type in `src/editor/register-drops.ts` keyed off `classifyAsset`
   (`assets.ts`). Wire `onDrop`/`onDragOver` on the canvas mount
   (`scene-view-panel.tsx:126`), converting the drop point to world space and
   snapping via the sticky state.
2. Sprite handler → `scene.defaultEntity(...)` + set `SpriteComponent.urlRef`
   (Sprite is an engine component the editor may set). When a drop can't produce
   a valid entity (empty `defaultEntity`, missing Transform, unreadable prefab
   JSON), surface a **toast** (reuse `src/editor/toast.ts`) explaining the
   failure — no silent no-op.
3. Prefab handler → read the `.prefab.json` (authored data, no Game import),
   journal a raw `entity-create` via `document.record` with the already-serialized
   components (do **not** call `createEntity`, which expects instances), patching
   `components.transform.position` to the snapped drop point.
4. Reconcile the prefab suffix: standardize on `.prefab.json`, rename the
   `content/prefabs/*.json` files, and fix the glob in
   `src/game/register-prefabs.ts` so runtime registration and editor
   classification (`assets.ts:35`) resolve the same files.
5. Inspector multi-edit (`src/editor/inspector/inspector.tsx`): with `ids.size > 1`,
   render components/fields common to all selected; a field edit fans out to all,
   wrapped in **one `composite`** journal entry (one undo step). Mixed values show
   a "multiple values" indicator; the per-commit `before===after` guard
   (`commands.ts:159`) is evaluated per entity.
6. **Composite poke-aware routing** (`SceneDocument.isPoke`/`record`,
   `scene-document.ts:261-315`): classify a composite by its targets — all-runtime
   → poke live-only (discarded on stop), all-authored → journal as one composite,
   mixed → split into a poked group + a journaled group. Fixes the crash where a
   composite touching any runtime entity hits `assertJournalable` and throws.

### Cross-cutting: undo-reselect

Each undo/redo **cursor position** (not the journal entry — `invertEntry`,
`journal-entry.ts:267`, is a closed switch that silently drops unknown fields)
carries a selection snapshot; undo restores it, filtering ids of entities the
edit deleted. Selection stays out of `*.scene.json` (provenance-clean by
construction — it is not an ECS component and the journal is never serialized).

## Research findings that drove this

- **Codebase**: selection is per-scene-id and scalar; inspector winner is
  recomputed per render (`app.tsx:249-277`); three divergent snap helpers;
  `pickEntityAt` is O(entities) with per-frame image lookups; cursor is an
  ad-hoc effect; drop target registered but unhandled; prefabs are Game-layer
  JSON (`spawnPrefab` deserializes into a live world — wrong path for authored
  edits).
- **Prior art (manipulation)**: Figma snap-ON-with-`Ctrl`-escape is the borrowed
  posture; intersect marquee is universal; `Alt`-drag duplicate is universal;
  Tiled's grid-cell big-nudge fits a level editor better than a fixed 10×.
- **Prior art (picking)**: the dominant cost is per-object recompute, not the
  loop; cache AABBs first, then `rbush` (idiomatic JS R-tree) broad-phase →
  narrow-phase. GPU picking not worth it on Canvas2D.
- **Prior art (architecture)**: VS Code `activeEditor` / Theia `SelectionService`
  — one active-view pointer feeding a shared selection channel, event-driven not
  recomputed. Selection is transient UI state, kept out of the document (Figma
  presence). Cursor: Qt's override-cursor stack → priority + disposable tokens.
- **Critique corrections folded**: picking is already rAF-cadence (real work is
  the cache+index, not cadence); ECS emits no field-mutation event (explicit
  dirty marking required); per-view selection contradicts the shared journal
  (→ per-scene + remove multi-view); composite entries crash poke classification
  (→ poke-aware routing); prefab suffix matches zero files; `createEntity` takes
  instances; undo snapshot must live on the cursor, not the entry; cursor must
  use inline style, be per-surface.

## Risks & open questions

- **Composite split-routing (mixed selection)** is the subtlest new logic: under
  one keystroke the authored part is undoable and the runtime part isn't. Needs
  a headless test (boot ECS + a run, multi-select mixed, edit, assert no throw +
  correct routing + one undo step for the authored part).
- **rbush maintenance completeness**: any missed rebuild site → silent wrong-entity
  picks. Every enumerated churn site (rebuildLive, revert, undo replay, world
  swap) needs an integration test that picks after the churn.
- **Snap "canonical AABB" vs topmost-hit**: narrow phase must reproduce the
  smallest-area-piece semantics or click selection changes for overlapping
  collider-vs-sprite entities. Test with nested/overlapping entities.
- **Async image bounds**: a dropped sprite whose image isn't loaded snaps by
  pivot; acceptable, but verify it doesn't jump visibly.
- **Removing multi-view** may break a persisted workspace blob that already
  encodes a suffixed view; needs a migration/guard on workspace load.
- Drop-failure surfacing (empty `defaultEntity`, missing Transform, unreadable
  prefab JSON) is resolved: a toast via the existing `src/editor/toast.ts`, not
  a silent no-op.
- **Scale**: this is multi-session. Suggested order — B (subtractive, unblocks A)
  → A + C + D (parallel substrate) → E → F. Land and verify each before the next.
