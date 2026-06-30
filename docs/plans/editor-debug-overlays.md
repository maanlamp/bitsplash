# Editor Debug Overlays & Unified Picking — Architectural Plan

Status: **first pass implemented**. Introduces visible, toggleable debug
overlays for spatial data (physics colliders, sensors, transform gizmos) and
collapses the ad-hoc hover/selection picking into the same geometry source, so
_what you see_ and _what you click_ are the same thing by construction.

## 1. Goal

Today the editor has one robust visualization stack (the inspector, driven by
`@serialize`) and several half-finished ones:

- **Picking/hover** derives a single AABB from `body` _or_ `sprite` (body wins),
  via a hardcoded precedence chain in `pick.ts`. Wrong for half the entity types
  (offset colliders, sprite-overhanging-collider, entities with neither).
- **Collision shapes and sensors** are not drawn at all — invisible while
  authoring.
- **Bare entities** (a `Transform` with no sprite/body) have no visible anchor.

This rework makes spatial data visible on demand, without blocking the game
view, and unifies picking with that same data.

## 2. Rejected approach — decorator-driven gizmos

We explicitly considered (and rejected) a `@gizmo`-style decorator vocabulary
mirroring `@serialize`. Reasoning:

- A decorator pays off only when **N is large and per-item logic is trivial and
  uniform** — true for `@serialize` (many fields, per-_field_ mapping, inspector
  is a free side effect of persistence). Debug viz is per-component-**type**, and
  there are only a handful of spatial types.
- A `ColliderDebugSystem` querying `PhysicsBodyComponent` already covers _every_
  physics body with one query. A `@gizmoBox` annotation would merely **restate
  what the query already knows** — redundant. And a generic system that reads
  gizmo decorators is _still a system_ plus a metadata layer on top.
- A `drawGizmo()` method on the component (Unity `OnDrawGizmos`) is a category
  error here: that model exists only because Unity components are behavior
  objects. This engine is pure-data ECS — logic lives in systems, components are
  data. See [[ecs-data-only-events]].

Conclusion: **small, concern-focused render systems**, not decorators. If the
count of spatial types ever grows large, introduce a generic reader _then_
([[defer-optimization-simplest-path]]).

## 3. Locked decisions

1. **Debug overlays are small editor render systems**, one per concern, each
   gating on a flag, querying a component, drawing on a debug layer.
2. **One shared geometry derivation** feeds _both_ picking and the overlays.
   Unify on a function (`entityGeometry`), not an abstraction.
3. **Picking targets the _union_ of every piece of geometry an entity declares**
   (collider box ∪ sensor box ∪ sprite rect ∪ fallback). No precedence chain.
   Tiebreak between entities = smallest _individual piece_ hit (not union area).
4. **Sprites are a picking source, not a debug overlay.** A sprite is already
   literally rendered on the canvas, so it needs no debug system — but a click
   anywhere on the sprite rect must select the entity, even outside any physics
   geometry.
5. **Anything with a `Transform` renders colored axis arrows** (a transform
   gizmo). Bare entities (no sprite, no body) additionally get an invisible
   fallback pick box so they remain clickable; the arrows are the visible cue.
6. **Selection / hover highlight reuses the same picking geometry** — the union
   bounding box of an entity's pieces — not a separately-invented shape.
7. **Visibility model: global "show flags".** Each overlay is an independent,
   persisted checkbox, on top of whatever else you're doing — independent of
   selection and of play/edit mode. (Unreal show-flags model.) **All overlays
   default ON**; persistence (localStorage) means each user tunes down once and
   it sticks.
8. **Surface: a toolbar popover.** An eye/debug button on the existing floating
   `Toolbar`, opening a glass popover of checkboxes — same glass + base-ui
   vocabulary already used for the mode `ToggleGroup`. Color swatches are
   **informational legend only** (no recolor).
9. **Placement: `src/editor/systems/`.** These systems hold the editor
   `DebugFlags` store directly (precedent: `EntityHighlightSystem` holds
   `EditorState`). Editor may import engine; no cross-layer flag threading. Engine
   stays unaware. Runtime/in-game debug draw is **deferred** — promote to engine
   only if needed.

## 4. First-pass overlay set

| id           | label      | draws                                  |
| ------------ | ---------- | -------------------------------------- |
| `colliders`  | Colliders  | non-sensor `PhysicsBodyComponent` box  |
| `sensors`    | Sensors    | sensor `PhysicsBodyComponent` box      |
| `transforms` | Transforms | X/Y axis arrows at any entity position |

**Explicitly deferred / dropped from earlier drafts:**

- **Sprite-bounds overlay** — dropped; sprites already render (still a picking
  source, §6).
- **Camera icon + bounds** — deferred to a future camera rework. The only
  `Camera2DComponent` present while editing is the editor's _own_ viewport
  camera (created by `EditorCamera2DSystem` with `EDITOR_CAMERA_PRIORITY`, and
  notably with **no `TransformComponent`**, so it draws no transform gizmo).
  In-scene cameras as authorable/manipulable entities are that future rework's
  job; until then there is nothing camera-shaped worth drawing.
- **Bridge ropes** — not a feature; dropped (and with it the `Renderer2D`
  drawing question — `drawLine`/`drawRect` already exist regardless).

## 5. Geometry model — `entityGeometry`

Replace the single-AABB `entityBounds` in `pick.ts` with a function returning a
**list of pieces**:

```
type GeometryPiece = Readonly<{
  role: "collider" | "sensor" | "sprite" | "fallback";
  center: Vector2;
  half: Vector2;           // AABB half-extents for hit-testing
}>;

entityGeometry(ecs, id, assetManager): GeometryPiece[]
```

Pieces, derived from existing component fields:

- **collider / sensor** — from `PhysicsBodyComponent`: `halfWidth`/`halfHeight`
  centered at `transform.position + (offsetX, offsetY)`. `role` is `"sensor"`
  when the `sensor` flag is set, else `"collider"`.
- **sprite** — from `SpriteComponent`: `spriteSource(sprite, image)` size ×
  `transform.scale`, centered on transform. Skipped if the image isn't loaded.
- **fallback** — `TILE_SIZE/2` box, added **only when no other piece exists**,
  so a bare `Transform` entity stays clickable.

This single function is the source of truth. Picking, overlays, and the
selection highlight all consume it — they never re-derive geometry independently.
(Transform axis arrows are a draw-only cue, not a geometry piece — the fallback
box carries the bare-entity hit target.)

## 6. Picking rework (`pick.ts`)

`pickEntityAt` iterates entities, and for each iterates its `entityGeometry`
pieces:

- An entity is a hit if **any** piece's AABB contains the world point.
- Score a hit by the **smallest hit piece's area**; global minimum wins. (Grabbing
  an entity by its tiny collider beats a giant overlapping sprite of another.)

`entityBounds` (single AABB) is removed; callers move to `entityGeometry`.

## 7. Selection / hover highlight refactor

`EntityHighlightSystem` moves off `entityBounds` onto `entityGeometry`: it
outlines the **union bounding box** of the entity's pieces as the single "this is
selected/hovered" rect. Per-piece detail comes from the debug overlays when
toggled on.

## 8. Debug overlay systems + `DebugFlags`

**`DebugFlags`** — a `Subscribable` editor store (sibling of `EditorState`),
named booleans keyed by overlay id, persisted to `localStorage`, all defaulting
to `true`. The popover reads/writes it; each overlay system reads it.

A single static **overlay descriptor list** (the source for both the popover rows
and the flag keys): `colliders`, `sensors`, `transforms` (§4), each with a label
and a color token. No dynamic registry — N is small and fixed (YAGNI).

**Overlay systems** (`src/editor/systems/`), each constructed with `DebugFlags`,
gate on their flag, query the component, and draw on the debug layer. Colliders
and Sensors filter `entityGeometry` pieces by role (distinct colors); the
transform gizmo draws X/Y axis arrows at each `TransformComponent` position. Line
widths follow the existing `2 / zoom` convention (`EntityHighlightSystem`).

## 9. Layers & color

- Add a `DEBUG_OVERLAY` band to `EditorLayer` (today: `DEBUG_GRID=0`,
  `EDITOR_PREVIEW=100`). It sits **above game content** (game layers top out at
  `DEBUG_TAG=90`) **below `EDITOR_PREVIEW`** so selection/hover outlines stay on
  top. A single shared layer is enough (overlays don't overlap-sort against each
  other meaningfully).
- Colors are **editor style tokens** (`--debug-collider`, etc.) per the styling
  rules, surfaced as informational swatches in the popover. Systems read the
  token's computed value (custom props can't reach the canvas color resolver
  directly); no hardcoded hex in systems.

## 10. Build order

1. `entityGeometry` (piece list) replacing `entityBounds`; port
   `EntityHighlightSystem` and `pickEntityAt` onto it (union picking).
2. `DebugFlags` store + the static overlay descriptor list.
3. `ColliderDebugSystem` + `SensorDebugSystem`.
4. `TransformGizmoDebugSystem`.
5. Toolbar eye button + glass popover wired to `DebugFlags`.
6. `DEBUG_OVERLAY` layer + color tokens + swatches.
