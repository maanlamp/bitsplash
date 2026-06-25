# Tile System Rework — Architectural Plan

Status: **planned** (no implementation yet). Replaces the single hardcoded
terrain grid with author-defined, entity-backed tile/decoration layers, a
data-driven autotiling model, optional per-layer collision, and a first-class
render-layer system that supersedes the hardcoded `Layer` const in
`platformer.ts`.

## 1. Goal

Today there is exactly one kind of tile: a boolean cell that is simultaneously
_the_ dirt tileset, _the_ collision source, and _the_ anchor decorations scatter
over. Everything is wired into the platformer scene factory by hand. This rework
breaks that knot so an author can, in-editor, create:

- multiple **autotiled terrain** materials (dirt, sand, bushes, …), each its own
  layer with its own tileset and optional collision;
- **manually-stamped** tile layers (exact sprite placed in an exact cell) for
  one-off props/scenery;
- **scattered decoration** layers (atlas + density), procedurally generated but
  individually curatable;
- **background and foreground** layers ordered freely around the player and other
  entities;

with none of it hardcoded onto a scene or a game class.

## 2. Current state (what we're replacing)

Factual anchor; all of this is the thing being reworked.

- `src/engine/tilemap/grid.ts` — `TileGrid`, a `Set<"gx,gy">` of occupied cells.
  Boolean only: a cell is solid or empty, no type, no per-cell data.
- `src/engine/tilemap/autotile.ts` — fixed 6-variant corner classifier
  (`classifyCorner`/`cornerSlots`, `Variant`, `Cap`), hardcoded `SHEET_COLUMNS =
3`, cap rows at row 2+. One convention, one tileset.
- `src/engine/tilemap/collision.ts` — `TileCollisionBaker` edge-traces the whole
  grid into static **polyline** chains (`createStaticChain` →
  `ColliderDesc.polyline`, `rapier-physics.ts:160`), all tagged
  `CollisionLayer.Terrain`. All-or-nothing, tied 1:1 to occupancy.
- `src/engine/decorations.ts` — `SurfaceDecorations`/`TileDecorations`
  hash-scatter sprites over the _same_ terrain grid. Not real cells; faked by
  hashing over occupancy.
- `src/engine/systems/tilemap-render.ts` — `TilemapRenderSystem(grid, tileset,
layer)`, per-instance, baked into a `StaticBatch`.
- `src/game/scenes/platformer.ts` — instantiates all of the above by hand;
  hardcodes assets (`dirt.tileset.png`, `knick-knacks-grass.png`,
  `tile-decorations.png`) and a numeric `Layer` const
  (`SURFACE_DECO_BACK: 10 … DEBUG_TAG: 90`).
- `src/engine/scene/scene.ts` — `Scene.tileGrid?`; `SceneFile` has a dedicated
  `tiles: SceneTileRect[]` section separate from `entities`.
- Editor: `src/editor/systems/tile-editor.ts` draws into the one grid; entity
  placement snaps to tile centres via floor-division (`entity-editor.ts`). This
  coordinate coupling is the "half-assed baking" being removed.

## 3. Core model — layers are entities

A level's tile content is an ordered set of **layer entities**, not a scene
field. Two component types, one system each (components are pure data; behaviour
in systems; relate by id, never hierarchy):

- **`TileLayerComponent`** (grid-based) — `mode: "autotile" | "stamp"`, a tileset
  reference, a collision mode (§6), a `renderLayer`/`order` (§5), and a sparse
  per-cell map. Autotile mode stores presence only; stamp mode stores an atlas
  index per cell. The map replaces `Set<"gx,gy">` with `Map<"gx,gy", number>`
  (autotile = sentinel, stamp = atlas index).
- **`DecorationLayerComponent`** (scatter) — no grid; see §8.

`Scene.tileGrid` is removed. Render/collision/autotile systems stop taking an
injected grid in their constructor and instead **query** their component across
all layer entities. Layer entities are **authored content**: they deserialize at
load and exist in the editor — unlike runtime entities (player, game camera)
which still spawn only on play.

## 4. Tileset as data — a pluggable scheme seam

The autotiler stops being one hardcoded algorithm. A tileset describes _how_ its
cells map to neighbour configurations, behind a generic seam.

A tileset declares an **ordered list of masked outputs**. Each output is:

- `sampleSet` — which neighbours contribute bits to the mask (4 corners, 4 edges,
  8 surround, …);
- `placement` — `primal` (tile on the cell; edge/blob schemes) or `dual` (tile on
  the cell _corner_, offset half a tile, +1 row/col; corner schemes);
- `table` — `mask → (cell, rot, flip)`.

This is one generic resolver; per-scheme content is pure data. Key realisations
from design:

- **The current corner-6 is a 2-color corner Wang tileset, art-optimised.** It
  samples 4 corners → 16 cases → collapsed to 6 sprites under the dihedral group
  (rotation+reflection), storing the transform per case. The dual-grid signature
  is already in `tilemap-render.ts` (bakes over `minY..maxY+1`, draws at
  `cell*TILE_SIZE − 16`). It is _not_ a bespoke algorithm — it is one
  configuration of the model above.
- **Corner and 8-neighbour (blob) schemes differ only in `sampleSet` +
  `placement`.** They are one family. There is no universal flat mask table both
  fit; there _is_ a universal resolver parameterised by those two fields.
- **Symmetry reduction is an authoring concern, not a runtime one.** The runtime
  table is just `mask → (cell, rot, flip)`; "6 sprites" is the incidental fact
  that 16 entries reuse 6 cells.
- **The "cap" (grass lip) is just output #1**, sharing the 4-corner `sampleSet`
  with the fill (output #0). Not a special case. A future tileset may have 3+
  outputs.

### Scope cut for now

- **Only the corner scheme is registered.** No blob-47, no edge, no `single`
  (those would be dead code). Adding one later is "register a resolver + supply a
  table," not a rearchitecture.
- **Tileset descriptors are convention-derived**, not authored. Every
  `*.tileset.png` is assumed corner-scheme; fill/cap outputs are inferred from
  sheet dimensions (as the renderer already does with its `rows` argument).
- **Deferred:** embedding descriptors in PNG metadata (`png-metadata.ts` already
  does iTXt JSON) and an in-editor terrain/mask authoring tool. These are the
  expensive part (a Godot/Tiled-style terrain editor); they are explicitly out of
  this rework. Bushes/sand conform to the corner layout with different art.

## 5. Render ordering — a render-layer registry

The hardcoded numeric `Layer` const is removed. In its place (the Unity
"Sorting Layers" model, fit to ECS):

- A **scene-level ordered registry of named render layers** — data, a list of
  `{id, name}`. New scenes seed defaults (background / entities / terrain /
  foreground); fully authorable thereafter.
- **`renderLayer` (id) + `order` (int) is a universal renderable property** —
  carried by tile grids, decoration layers, _and_ entities. Id-references into a
  shared registry; no hierarchy.
- Sort key = (registry index of `renderLayer`, then `order`, then a stable
  tiebreak). The `order` int is required because anything sharing a slot (two
  enemies; a grid + an entity) needs a deterministic within-slot order. Entities
  need a sane **default** layer so authors don't assign every arrow.
- The **layers panel** (§10) is the editor view of this registry. The player's z
  is just its own declared `renderLayer` — it is not a magic fixed plane; you
  reorder layers around it.

Consequence: "all terrain renders over the player" (chosen earlier) is expressed
purely as layer ordering — the collidable terrain layer + its caps sit in a slot
above the player's slot. The player is never drawn in front of walls; the grass
cap overlaps his feet because the terrain layer is above him. (Accepted on the
basis that the player sprite does not overhang into solid cells in this game.)

Open: whether `renderLayer`/`order` live on a shared renderable component or as
fields on each render-driving component.

## 6. Collision

Per-layer collision **mode: `none | solid | one-way`**. No per-layer friction
material, no collision masks (everything collides with terrain or not at all).

### Bake by mode, not by layer

Collidable occupancy is **merged across all layers of the same mode** and traced
once per mode → at most two static bodies (one solid, one one-way). Material
differences do not fragment geometry (material is not physical — see below), so
there is no reason to keep layers as separate bodies, and merging avoids
seams between abutting colliders.

### Use trimesh + FIX_INTERNAL_EDGES, not polyline

Ghost collisions (a body snagging on the seam between separate flush colliders)
are a real Rapier problem, same family as the old planck bug. Findings:

- The problem is **between separate colliders**, not within one continuous shape.
- `FIX_INTERNAL_EDGES` exists but is a **`TriMeshFlags`** value — it applies to
  `trimesh` colliders only, **not** `polyline` (`shape.d.ts:135`,
  `collider.d.ts:627`). The current baker's `polyline` gets no correction.
- The player's `roundCuboid` (`rapier-physics.ts:126`) is only _partial_
  mitigation (prevents getting fully stuck, can cause hops).

Therefore bake terrain as **`trimesh` with `FIX_INTERNAL_EDGES`**. Merging per
mode (above) means there are no inter-layer seams within a body, and the flag
fixes internal edges within it — eliminating the snag surface rather than relying
on the round player collider.

### Surface feel (ice/mud) is gameplay, not physics

The player controller is already a hand-rolled kinematic controller, not
physics-friction-driven: `player-input.ts:47-52` computes a target X-velocity
from `maxSpeed`/`acceleration`/`deceleration`/`airControl` and forces the body
there via impulse each frame; jumps/wall-slides set `linearVelocity` directly.
Rapier friction is a near-dead input. So ice/mud = the controller reading lower
`deceleration`/`acceleration` from the layer underfoot — _consistent_ with the
existing controller, not a hack bolted beside the engine. Encoding it as a Rapier
friction coefficient would be the more roundabout path (the controller bypasses
friction and would have to read it back anyway), and it would fragment geometry
into per-material bodies, reintroducing seams.

**Bounce** is out of tile scope — a separate entity (the jump already overrides Y
velocity, so a bounce pad belongs in gameplay/trigger code, not a tile material).

### One-way platforms — binding constraint

Solver-contact modification (the clean way to keep only upward-blocking contacts)
is **not supported in `@dimforge/rapier2d`** — `physics_hooks.js:6` literally
comments out `MODIFY_SOLVER_CONTACTS` as "Not supported yet in JS." Only
`FILTER_CONTACT_PAIRS` / `FILTER_INTERSECTION_PAIRS` are available.

So one-way is built as a **contact-pair filter hook**: tag one-way colliders, and
in the hook enable/disable the _entire_ actor↔platform contact based on the
actor's position/velocity relative to the platform top. This is coarser than
solver modification (binary per pair) but works for any body the hook can reason
about. First implementation task is to validate this hook approach in a running
build before relying on it. Fallback if the hook proves inadequate: sensor +
controller handling (only respects entities that have a controller; arrows would
pass through — likely acceptable).

## 7. Grid and coordinate decoupling

- **One global cell size.** Keep `TILE_SIZE` as a single named constant (it
  already is). _Not_ editor-authorable: it is a project-wide art contract (every
  tileset is drawn to it; autotile sampling, collision merge, and snap all assume
  it) and changing it per-level would need migration for zero near-term value.
  Promotable to a project-config later if ever needed; not a per-level field.
- **No global grid object.** Each grid layer owns its own sparse cell map. What's
  shared is only the cell-size/origin _convention_ used for coordinate↔cell math
  and editor snapping.
- **Entity placement is fully decoupled from tiles.** Entities live in free world
  space; snap-to-grid becomes an opt-in editor convenience (e.g. shift), with no
  runtime dependency of entity placement on any grid. Entities and tiles meet
  only through physics collision.

## 8. Decoration layers

Procedural base + sparse curation (the Minecraft "generate then curate" model),
keeping auto-follow:

- **Base (derived, not stored):** `atlas, density, seed, jitter`, plus a
  reference to a grid layer and a surface rule (e.g. "top-surface cells of layer
  X"). Edits to that terrain re-scatter for free. A pristine layer serialises to
  these few params — pure derivation, per the "derive, don't store" rule.
- **Sparse cell-keyed override map** on top: `suppress` (remove an RNG-placed
  decoration) and `set(atlasIndex)` (replace, or force-add onto an RNG-empty
  cell). Render = override wins per cell, else procedural result. Decorations are
  one-per-cell with deterministic jitter, so the editor tool is "click → world →
  cell → suppress / pick variant" against the existing grid convention — no
  free-floating instance IDs, no spatial index.
- Zero overrides ⇒ behaviour identical to pure procedural scatter. The override
  list is the only per-instance data persisted.

The expensive/rejected alternative was "bake to a frozen instance list," which
kills auto-follow (new terrain comes up bare) and needs fiddly re-bake merging.

## 9. Serialization

- **Everything is entities → one `SerializedWorld`.** Tile and decoration layers
  serialise through the normal entity/component path (`@serializable` /
  `@serialize`). The dedicated `tiles: SceneTileRect[]` section in `SceneFile`
  is **removed**; a level becomes "just entities."
- **Compact grid encoding** in the `@serialize`d cell field: autotile =
  presence rects (RLE, like today's `tileRects`); stamp = run-length of indices;
  decoration = the sparse override list. A pristine decoration layer stores no
  override data.
- **Migration** (open): convert existing `demo.scene.json` `tiles` rects into one
  autotile terrain layer + decoration layers for the old knick-knacks, or rebuild
  the level. One-time.

## 10. Editor authoring (open UX)

Frame: a **layers panel** (Tiled/Aseprite-style) — an ordered, drag-reorderable
list; each row shows type (autotile / stamp / decoration), tileset/atlas,
collision mode, visibility; one layer is **active** and paint/erase/fill tools
target it; stack order is the render-layer registry order from §5. Tilesets are
expected to be glob-registered assets (matching the existing `*.tileset.png`
naming), referenced by id from a layer.

The specific interactions (add/remove/reorder controls, active-layer targeting,
the decoration curation tool's atlas picker, per-layer config surfaces, how
runtime entities appear in the stack) are UX decisions to be raised with the user
during the build per `AGENTS.md`, not pre-decided here.

## 11. Open items / verification

1. **Validate the one-way `FILTER_CONTACT_PAIRS` hook** in a running build before
   relying on it (§6). First implementation task.
2. **Editor layer-management UX** (§10) — surface decisions during build.
3. **`demo.scene.json` migration vs rebuild** (§9).
4. **Home of `renderLayer`/`order`** — shared renderable component vs per-component
   fields (§5).

## 12. Suggested build order

1. Render-layer registry + universal `renderLayer`/`order`; port the existing
   hardcoded `Layer` const onto it (no behaviour change yet). De-risks §5 early.
2. `TileLayerComponent` + its render system (autotile mode first), scheme seam
   with the corner resolver lifted behind it; convention-derived descriptors.
3. Collision rework: trimesh + `FIX_INTERNAL_EDGES`, merge-by-mode; then the
   one-way hook (item 1 of §11).
4. Stamp mode on `TileLayerComponent`.
5. `DecorationLayerComponent`: procedural base, then the sparse override map +
   curation tool.
6. Serialization unification + `tiles`-section removal + migration.
7. Editor layers panel (UX surfaced per §10).
