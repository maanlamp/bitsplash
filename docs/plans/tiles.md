# Tile System Rework — Architecture

Status: **architecture reference**. Slices are implemented as their own plans;
slice 1 is `feature-tile-layers.md`. This document holds the shared model and
the sketches for later slices.

## 1. Goal and priorities

Replace the single hardcoded terrain grid with author-defined, entity-backed
tile/decoration layers, a data-driven autotiling model, per-layer collision,
and a render-layer registry superseding the hardcoded `Layer` const in
`platformer.ts`.

Worldbuilding priorities drive the slice order:

1. **Background tile layers** (autotiled fill, no collision) so the world is
   more than floating blocks — slice 1.
2. **One-way platforms** for richer movement — slice 2.
3. **Paintable props** (trees, houses, features) — slice 3.
4. Decoration curation and layers-panel polish — later slices.

## 2. Current state (what's being replaced)

- `engine/tilemap/grid.ts` — `TileGrid`, boolean `Set<"gx,gy">`, microtask-
  coalesced `onChange`.
- `engine/tilemap/autotile.ts` — fixed 6-variant corner classifier, hardcoded
  `SHEET_COLUMNS = 3`, cap row at 2+.
- `engine/tilemap/collision.ts` — `TileCollisionBaker` edge-traces the grid
  into static polyline chains (`createStaticChain` →
  `ColliderDesc.polyline`, `rapier-physics.ts:160`), tagged
  `CollisionLayer.Terrain`.
- `engine/decorations/decorations.ts` — hash-scatter over the same grid;
  density/jitter already parameterized from `game/constants.ts`.
- `engine/tilemap/tilemap-render-system.ts` — per-instance system baked into a
  `StaticBatch`; dual-grid rendering (bakes `minY..maxY+1`, draws at
  `cell*TILE_SIZE − HALF_TILE_SIZE`).
- `game/scenes/platformer.ts` — hand-wires all of the above; hardcodes
  `dirt.tileset.png` and the numeric `Layer` const.
- `engine/scene/scene.ts` — `Scene.tileGrid?`; `SceneFile.tiles:
  SceneTileRect[]` separate from `entities`; `SceneConfig.tileset` is a dead
  serialized field nothing consumes (dies in slice 1).
- Grid consumers beyond the obvious: `ArrowSystem` (only `bounds()`, for
  despawn), `bootstrap.ts` (receives `tileGrid` but never uses it —
  vestigial), editor `TileEditorSystem`/preview/`History` closures,
  `scene-document.ts` dirty baseline, `level-export.ts` rect encoder.

## 3. Core model — layers are entities

A level's tile content is an ordered set of **layer entities**. Two component
types, one system each; components are pure data, relate by id, no hierarchy:

- **`TileLayerComponent`** (grid-based) — `mode: "autotile" | "stamp"`, a
  tileset reference, a collision mode (§6), `renderLayer` + `order` (§5), and
  a sparse per-cell store (autotile: presence; stamp: atlas index per cell).
- **`DecorationLayerComponent`** (scatter) — no grid; see §8.

`Scene.tileGrid` is removed. Render/collision systems stop taking an injected
grid and **query** layer components. Layer entities are authored content:
they deserialize at load and exist in the editor, unlike runtime entities.

## 4. Tileset as data — a pluggable scheme seam

A tileset declares an ordered list of masked outputs, each with a `sampleSet`
(which neighbours contribute mask bits), `placement` (`primal` | `dual`), and
a `table: mask → (cell, rot, flip)`. One generic resolver; per-scheme content
is data. The current corner-6 is one configuration: a 2-color corner Wang
set, 4-corner sampleSet, dual placement, 16 cases collapsed to 6 sprites
under the dihedral group. The grass cap is just output #1 sharing the fill's
sampleSet.

Scope cuts (unchanged): only the corner scheme is registered; descriptors are
convention-derived from `*.tileset.png` sheet dimensions, not authored;
PNG-metadata descriptors and an in-editor terrain/mask authoring tool stay
deferred. Background tilesets are the corner layout with different art.

## 5. Render ordering — a render-layer registry

The numeric `Layer` const dies. In its place:

- An ordered registry of named render layers, held in a **singleton
  registry component entity**, serialized through the normal entity path
  (scene config would be a second serialization mechanism for no reason).
  New scenes seed defaults; fully authorable.
- `renderLayer` (id-reference into the registry) + `order` (int) live as
  **plain fields on each render-driving component** (`SpriteComponent`,
  `TileLayerComponent`, `DecorationLayerComponent`). No shared renderable
  component until a second entity-carried renderable exists.
- Sort key = (registry index, `order`, stable tiebreak). Entities get a sane
  default layer. Renderer2D already sorts numeric layer ids dynamically
  (`orderedLayers()`), so registry index maps straight onto it.
- The layers panel (§10) is the editor view of this registry; the player's z
  is its own `renderLayer`, not a magic plane. "Terrain renders over the
  player" is pure layer ordering.

## 6. Collision

Per-layer `mode: none | solid | one-way`. No friction materials, no masks.

- **Bake by mode, not by layer.** Occupancy merges across all layers of the
  same mode, traced once per mode → at most two static bodies. No inter-layer
  seams.
- **Polyline stays; trimesh demoted to fallback.** The trimesh +
  `FIX_INTERNAL_EDGES` rework was motivated by ghost collisions, but the
  player's `roundCuboid` fix works and the migration isn't free (loop
  triangulation, `earcut`, holes). Stated convention instead: **moving actors
  use rounded colliders**. Known residual risk: rectangular moving colliders
  can snag on segment junctions, and the solid↔one-way body seam is the
  between-colliders case rounding only partially mitigates. Revisit trimesh
  only if the one-way spike or a new entity type actually snags.
- **One-way = contact-pair filter hook.** `MODIFY_SOLVER_CONTACTS` is not
  supported in `@dimforge/rapier2d` (JS build); only `FILTER_CONTACT_PAIRS` /
  `FILTER_INTERSECTION_PAIRS` exist. Tag one-way colliders and enable/disable
  the whole actor↔platform pair from the actor's position/velocity relative
  to the platform top. **Unproven — slice 2 starts with a throwaway spike**
  validating the hook before anything depends on it. Fallback: sensor +
  controller handling (arrows pass through; likely acceptable).
- **Surface feel (ice/mud) is gameplay, not physics** — the kinematic
  controller reads acceleration/deceleration from the layer underfoot;
  Rapier friction is a near-dead input. Bounce is a gameplay entity, out of
  tile scope.

### Terrain occupancy API — permanent, not a stopgap

Engine-level queries over merged solid-mode occupancy (`isSolid`, merged
`bounds`) are the canonical way gameplay asks about terrain — arrows, spawn
placement, later AI navigation. Implementations behind it may change; the
API and its callers don't.

## 7. Grid and coordinate decoupling

- One global `TILE_SIZE` constant; a project-wide art contract, not
  editor-authorable, promotable to project config later if ever needed.
- No global grid object; each layer owns its sparse cell store. Shared is
  only the cell-size/origin convention.
- Entity placement fully decoupled from tiles; snap-to-grid is an opt-in
  editor convenience. Entities and tiles meet only through physics.

## 8. Decoration layers (later slice)

Procedural base + sparse curation: base params (`atlas, density, seed,
jitter`, grid-layer ref, surface rule) are derived-not-stored; a sparse
cell-keyed override map (`suppress` / `set(atlasIndex)`) is the only
persisted per-instance data. Zero overrides ≡ pure procedural. Rejected:
baking to frozen instance lists (kills auto-follow).

## 9. Props (slice 3 sketch)

Split by what the thing is, not by wind:

- **Interactable/behavioural** (doors, signposts, chests): plain entities.
- **Decorative structure and flora** (trees, houses): **stamp layers** —
  per-cell atlas indices, painted as multi-cell chunks (Tiled-style stamp
  brush).
- **Small auto-scatter knick-knacks**: decoration layers (§8).

### Wind seam (wind itself out of scope)

Sway is a render-time vertex-shader effect: static geometry, per-quad/vertex
sway-weight attribute (top = 1, base = 0), time + wind uniforms. Batches
never rebake; CPU cost zero. When stamp/decoration rendering lands, batch
quads carry a sway-weight attribute defaulting to zero — that seam is all
this rework bakes in. Displacement is **art-space, pixel-snapped** (whole
art-res pixels) to keep the pixel-lattice contract of the camera pipeline.
The weather/wind system driving the uniforms is its own later plan.

## 10. Serialization

- Everything is entities → one `SerializedWorld`. `SceneFile.tiles` is
  removed; a level is just entities. `SceneConfig.tileset` field deleted.
- Compact encoding in the `@serialize`d cell field: autotile = presence rects
  (RLE, as `level-export.ts` does today); stamp = run-length of indices;
  decoration = the sparse override list. The serializer already handles
  nested value types and plain arrays, so this fits a field directly.
- **Migration (decided):** the loader converts old-format `tiles` rects into
  a default solid autotile terrain layer entity (dirt tileset) + seeded
  registry; next save writes the new format.

## 11. Editor authoring

Minimal panel first (slice 1, agreed shape): ordered list in existing editor
chrome — per row: name, tileset (from glob-registered `*.tileset.png`
assets), collision toggle, visibility eye, drag reorder; one active row
targeted by paint/erase/fill/lasso; add-layer button. Entities appear as one
fixed marker row for ordering, not per-entity rows. No opacity/blend/groups.
Editor undo/`History` must retarget the active layer (today's closures
capture the single `TileGrid`). Richer interactions (decoration curation
tool, per-layer config surfaces) are later slices; UX decisions surface with
the user per `AGENTS.md`.

## 12. Slices

1. **Tile layers + backgrounds** — `feature-tile-layers.md`: registry,
   `TileLayerComponent` (autotile), query render, serialization + migration,
   occupancy API repoint, minimal layers panel.
2. **One-way platforms** — hook spike first, then one-way collision mode +
   merge-by-mode bake.
3. **Props** — stamp mode + multi-cell stamp brush + sway-weight seam;
   entity placement flow for interactables if needed.
4. **Decoration rework** — `DecorationLayerComponent`, procedural base,
   override curation tool.
5. **Layers panel polish** as needs surface.
