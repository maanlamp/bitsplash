# Editor Debug Overlays & Unified Picking — Architectural Plan

Status: **planned** (no implementation yet). Introduces visible, toggleable
debug overlays for everything spatial (colliders, sensors, sprite bounds, camera
bounds, ropes, …) and collapses the ad-hoc hover/selection picking into the same
geometry source, so _what you see_ and _what you click_ are the same thing by
construction.

## 1. Goal

Today the editor has one robust visualization stack (the inspector, driven by
`@serialize`) and several half-finished ones:

- **Picking/hover** derives a single AABB from `body` _or_ `sprite` (body wins),
  via a hardcoded precedence chain in `pick.ts`. Wrong for half the entity types
  (offset colliders, sprite-overhanging-collider, camera/trigger with neither).
- **Collision shapes, sensors, camera bounds, bridge ropes** are not drawn at
  all — invisible while authoring.

This rework makes all spatial data visible on demand, without blocking the game
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
   ~12 lines: gate on a flag, query a component, draw on a debug layer.
2. **One shared geometry derivation** feeds _both_ picking and the overlays.
   Unify on a function, not an abstraction.
3. **Picking targets the _union_ of every piece of geometry an entity declares**
   (sprite rect ∪ collider box ∪ camera bounds ∪ fallback). No precedence chain.
   Tiebreak between entities = smallest _individual piece_ hit (not union area).
4. **Visibility model: global "show flags".** Each overlay is an independent,
   persisted checkbox, on top of whatever else you're doing — independent of
   selection and of play/edit mode. (Unreal show-flags model.)
5. **Surface: a toolbar popover.** An eye/debug button on the existing floating
   `Toolbar`, opening a glass popover of checkboxes — same glass + base-ui
   vocabulary already used for the mode `ToggleGroup`.
6. **Placement: `src/editor/systems/`.** These systems hold the editor
   `DebugFlags` store directly (precedent: `EntityHighlightSystem` holds
   `EditorState`). Editor may import engine; no cross-layer flag threading. Engine
   stays unaware. Runtime/in-game debug draw is **deferred** — promote to engine
   only if needed.

## 4. Geometry model — `entityGeometry`

Replace the single-AABB `entityBounds` in `pick.ts` with a function returning a
**list of pieces**:

```
type GeometryPiece = Readonly<{
  role: "collider" | "sensor" | "sprite" | "camera" | "fallback";
  center: Vector2;
  half: Vector2;           // AABB half-extents for hit-testing
  cornerRadius?: number;   // visual only (collider), deferred
}>;

entityGeometry(ecs, id, assetManager): GeometryPiece[]
```

Pieces, derived from existing component fields:

- **collider / sensor** — from `PhysicsBodyComponent`: `halfWidth`/`halfHeight`
  centered at `transform.position + (offsetX, offsetY)`. `role` is `"sensor"` when
  the `sensor` flag is set, else `"collider"`. `cornerRadius` carried for draw.
- **sprite** — from `SpriteComponent`: `spriteSource(sprite, image)` size ×
  `transform.scale`, centered on transform. Skipped if the image isn't loaded.
- **camera** — from `Camera2DComponent`: computed bounds `viewport / zoom`
  centered on transform. This is the case that would have needed an expression-DSL
  under decorators; as a system it's just arithmetic.
- **fallback** — `TILE_SIZE/2` box for an entity that has a `Transform` but none
  of the above, so cameras-without-viewport-yet / trigger volumes / bare entities
  remain clickable.

This single function is the source of truth. Picking, overlays, and the
selection highlight all consume it — they never re-derive geometry independently.

## 5. Picking rework (`pick.ts`)

`pickEntityAt` iterates entities, and for each iterates its `entityGeometry`
pieces:

- An entity is a hit if **any** piece's AABB contains the world point.
- Score a hit by the **smallest hit piece's area**; global minimum wins. (Grabbing
  an entity by its tiny collider beats a giant overlapping sprite of another.)

`entityBounds` (single AABB) is removed; callers move to `entityGeometry`. The
selection/hover highlight (§7) updates in lockstep.

## 6. Debug overlay systems + `DebugFlags`

**`DebugFlags`** — a `Subscribable` editor store (sibling of `EditorState`),
named booleans, persisted to `localStorage`. The popover reads/writes it; each
overlay system reads it.

A single static **overlay descriptor list** (the source for both the popover rows
and the flag keys), e.g.:

```
OVERLAYS = [
  { id: "colliders",    label: "Colliders",     color: --debug-collider },
  { id: "sensors",      label: "Sensors",       color: --debug-sensor   },
  { id: "spriteBounds", label: "Sprite bounds", color: --debug-sprite   },
  { id: "cameraBounds", label: "Camera bounds", color: --debug-camera   },
  { id: "ropes",        label: "Bridge ropes",  color: --debug-rope     },
]
```

No dynamic registry — N is small and fixed (YAGNI).

**Overlay systems** (`src/editor/systems/`), each constructed with `DebugFlags`,
shape:

```
render({ renderer, ecs, assetManager }) {
  if (!this.flags.colliders) return
  for (id of ecs.with(PhysicsBodyComponent))
    for (piece of entityGeometry(ecs, id, assetManager))
      if (piece.role === "collider")
        renderer.drawRect(DEBUG_LAYER, rectOf(piece), { stroke: color, lineWidth })
}
```

- **Colliders / Sensors** — filter `entityGeometry` pieces by role; sensors in a
  distinct color.
- **Sprite bounds** — `role: "sprite"` pieces.
- **Camera bounds** — `role: "camera"` pieces.
- **Bridge ropes** — draws the verlet point chain from the bridge component's
  runtime points. Needs polyline drawing; if `Renderer2D` has no `drawLine`, add
  one (preferred) or fall back to thin segment rects. Confirm during build.

Line widths follow the existing `2 / zoom` convention (`EntityHighlightSystem`).

## 7. Selection / hover highlight refactor

`EntityHighlightSystem` currently outlines one `entityBounds` AABB. It moves to
`entityGeometry`: outline the **union bounding box** of the entity's pieces as
the single "this is selected/hovered" rect (clean, unambiguous), while per-piece
detail comes from the debug overlays when toggled on.

> Open UX (§9): union bbox vs. outlining each piece for the selected entity.

## 8. Layers & color

- Add a debug-overlay layer band to `EditorLayer` (today: `DEBUG_GRID=0`,
  `EDITOR_PREVIEW=100`). Overlays sit **above game content, below**
  `EDITOR_PREVIEW` so selection/hover outlines stay on top. Single shared
  `DEBUG_OVERLAY` layer is enough (overlays don't overlap-sort against each
  other meaningfully).
- Colors are **editor style tokens** (`--debug-collider`, etc.) per the styling
  rules, surfaced as small swatches in the popover. No hardcoded hex in systems
  beyond reading the token-derived value.

## 9. Open items / UX to confirm during build

1. **Popover component** — base-ui `Popover` + `Checkbox` (check `base-ui`
   first per AGENTS.md); eye/debug trigger button on `Toolbar`.
2. **Selection highlight detail** — union bbox vs. per-piece outline (§7).
3. **Color swatches** — purely informational, or click-to-recolor? (lean:
   informational only.)
4. **`Renderer2D.drawLine`** — add vs. segment-rects for ropes (§6).
5. **Default-on overlays** — do any start enabled (e.g. Colliders), or all off?

## 10. Build order

1. `entityGeometry` (piece list) replacing `entityBounds`; port
   `EntityHighlightSystem` and `pickEntityAt` onto it (union picking). Behavior
   parity check first, then the union semantics. De-risks the shared spine.
2. `DebugFlags` store + the static overlay descriptor list.
3. `ColliderDebugSystem` + `SensorDebugSystem` (first real overlays, exercise the
   flag-gating pattern end to end).
4. Toolbar eye button + glass popover wired to `DebugFlags`.
5. `SpriteBoundsDebugSystem`, `CameraBoundsDebugSystem`.
6. `RopeDebugSystem` (+ `drawLine` if needed).
7. Color tokens + swatches; default-on decision.

```

```
