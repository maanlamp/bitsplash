# Feature: tile layers (slice 1 of tiles rework)

## Context

The world is one hardcoded dirt grid: a single `TileGrid` wired by hand into
`platformer.ts`, doubling as the only tileset, the collision source, and the
decoration anchor. Worldbuilding for the acts needs background terrain behind
the player first (see `tiles.md` §1). This slice swaps the data model to
layer entities and delivers multi-layer autotile authoring; one-way
platforms, stamp mode, and decoration curation are later slices.

## Goal

An author can create multiple autotiled tile layers in the editor (each with
its own tileset, collision on/off, ordered freely around the player), paint
on the active one, and save/load the result — with game behaviour on the
existing level unchanged after migration.

## Scope

In: render-layer registry + `renderLayer`/`order` fields; `TileLayerComponent`
(autotile mode only) with compact serialization; query-based tilemap
rendering; old-format migration; terrain occupancy API and repointing all
`TileGrid` consumers; minimal layers panel; deletion of `Scene.tileGrid`,
`SceneFile.tiles`, `SceneConfig.tileset`, and the `level-export.ts` rect
encoder.

Out (explicit non-goals): one-way/trimesh collision work (slice 2 — the
polyline baker survives, repointed); stamp mode and props (slice 3);
decoration layer rework and curation (slice 4); wind/sway (only later slices
bake the seam); scheme-seam generalization of the autotiler (corner-6 stays
the only scheme; the resolver seam of `tiles.md` §4 lands when a second
scheme exists); panel polish (opacity, blend, groups, rename UX).

## Decisions

- **Layers are entities** (one entity per layer, not per tile) — matches
  Godot 4.3 `TileMapLayer` / Unity Tilemap-per-GameObject; per-tile entities
  rejected for perf and pointlessness on static terrain (`tiles.md` §3,
  sanity-checked against industry).
- **Registry lives in a singleton `RenderLayersComponent` entity**, authored
  and serialized through the normal entity path; scene config would be a
  second serialization mechanism.
- **`renderLayer`/`order` are plain fields per render-driving component**
  (`SpriteComponent`, `TileLayerComponent`); no shared renderable component
  until a second entity-carried renderable exists.
- **`TileGrid` survives as the runtime cell store inside the component**; its
  microtask-coalesced `onChange` already gives auto-coalesced rebuilds. The
  `@serialize`d field is the compact rect encoding (RLE, the `level-export.ts`
  algorithm moved into the component's sync), kept in sync from the same
  coalesced notification.
- **Occupancy API is permanent**: merged solid-mode queries (`isSolid`,
  merged `bounds`) in `engine/tilemap/` are the canonical terrain questions;
  the polyline baker becomes just another caller.
- **Migration over rebuild**: the scene loader converts old `tiles` rects
  into one solid autotile layer (dirt tileset) + seeded registry; next save
  writes entities-only.
- **Tileset references are asset paths** resolved per side: game via
  `import.meta.glob` over `content/assets/*.tileset.png` (URL map), editor
  via its existing tileset asset infrastructure (`TILESET_SUFFIX`).
- **Layer visibility (the eye) is editor-only runtime state**, not
  serialized — it's an authoring aid, not level data.

## Approach

1. **Render-layer registry.** `RenderLayersComponent` (engine/render/):
   serialized ordered list of `{id, name}`; resolver helper mapping
   (registry index, `order`) → the numeric ids Renderer2D already sorts
   (`orderedLayers()`); seed defaults (background / entities / terrain /
   foreground / overlay) on scene create and in migration. Port the `Layer`
   const consumers in `platformer.ts` (DebugTag, QuestMarker, InteractHint,
   Sprite, Tilemap, Health render systems) onto registry names.
   `SpriteComponent` gains `renderLayer` (default entities) + `order`;
   `SpriteRenderSystem` resolves per sprite. No behaviour change.
2. **`TileLayerComponent` + data-model swap** (the big step; ends green with
   the migrated demo level playing identically). Component in
   `engine/tilemap/`: `name`, `tileset` (file ref), `collision:
"none" | "solid"`, `renderLayer`, `order`, serialized rect field +
   runtime `TileGrid`. `TilemapRenderSystem` drops constructor injection,
   queries all layers, caches one `StaticBatch` per layer entity, loads each
   layer's tileset on demand (missing asset blocks only that layer's
   rendering). Occupancy API + merged bounds in `engine/tilemap/`;
   `TileCollisionBaker` rebuilds from merged solid-mode occupancy;
   `ArrowSystem` uses merged bounds; `bootstrap.ts` drops its unused
   `tileGrid` dep. Loader migration (old `tiles` rects → layer entity).
   Deletions ride along: `Scene.tileGrid`/`SceneParams.tileGrid`,
   `SceneFile.tiles`, `SceneConfig.tileset`, `level-export.ts` rect encoder,
   `scene-document.ts` tile baseline (entity diffing now covers layers),
   `scene-view.ts` grid wiring.
3. **Editor retarget.** `EditorState` gains `activeLayer` (entity id,
   defaulting to the first tile layer); `TileEditorSystem`,
   `tile-editor-preview.ts`, and `History` entries operate on the active
   layer's store (undo/redo records the layer id, not a closed-over grid).
   Entity click-select excludes layer entities.
4. **Layers panel** (agreed minimal shape): embedded in `SceneViewPanel`
   via the workspace `Split` (view-owned, like the sprite editor's panel —
   scene-dependent panels live inside the scene view, decided over global
   docks). Per row: visibility eye (editor-only), tileset picker
   (image dialog), inline rename, collision toggle, delete, drag reorder;
   active row highlighted, paint/erase/fill/lasso target it; add-layer
   button; entities appear as one draggable marker row. Reorder rewrites
   `renderLayer`/`order`: rows above the marker map to `terrain`, below to
   `background`, order by position. Styling mirrors the sprite editor's
   layers panel per `docs/EDITOR_STYLING.md`.

## Verification

- `bun check` after every step.
- Step 2: user playtest — load old-format demo, play (move, jump, shoot,
  pick up, talk); save, confirm new entities-only format; reload the saved
  file, identical behaviour.
- Step 3–4: editor smoke — create a second background layer, paint on both,
  reorder around the entities row, toggle visibility, undo across layer
  switches, save/reload roundtrip.

## Open follow-ups

- Slice 2: one-way platforms (hook spike first) — `tiles.md` §6/§12.
- Slice 3: stamp mode + props + sway-weight seam.
- Slice 4: decoration layer rework + curation.
- Scheme-seam generalization of the autotiler when a second scheme arrives.
- Migrate the entity inspector into the scene view it edits (same
  view-owned-panel argument as the layers panel; own slice — touches view
  registry, auto-insert logic, tree selection flow).
