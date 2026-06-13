# Sprite Editor Extensions — Architectural Plan

Status: **planned** (no implementation yet). README summary under "Sprite Editor
Extensions". Pure editor tooling (per `editor-vs-runtime-separate`). Authors the
Animation system's model (`animation.md`).

## 1. Goal

Grow the sprite editor into a full pixel-art + animation authoring tool:
selection, a real drawing toolset, palettes (OKLCH), and animation authoring.
Build order: **selection foundation → drawing toolset → palettes → animation
authoring**. Skeletal is parked.

## 2. Where we are today

- `editor/sprite/sprite-document.ts` — `SpriteDocument`: multi-layer RGBA Canvas2D
  (blend/opacity/visibility/reorder/rename), composite flatten, 1px
  `setPixel`/`erasePixel`, `colorAt`/`alphaAt`, snapshot (`snapshot`/`restore`) +
  full-doc (`captureState`/`restoreState`) for undo, `toBlob` PNG export. Layers
  not persisted in file.
- `editor/sprite/sprite-tools.ts` — a flat enum: `paint | erase | pan | pick`.
  1px brush only; no lines/shapes/fill/select/replace/size/mirror.
- OKLCH colour model already in `sprite-editor-state.ts` (the ramp strength).
- `editor/timeline/` — a **generic clip `Timeline`** (tracks/clips, CSS-grid)
  already backing the audio editor; the animation timeline reuses it.
- `editor/systems/tile-editor.ts` — has bresenham line + flood-fill (cap'd) for
  tiles; reuse those algorithms for the sprite tools.
- `editor/history.ts` — generic undo/redo `Command` stack.

## 3. Locked decisions

1. **Palette-as-asset + RGBA nearest-match remap** (no indexed-color mode).
2. **Skeletal parked** as a research note (§8).
3. **All clusters in scope**; order = selection → toolset → palettes → animation.

## 4. Selection foundation (build first)

- A **selection mask** on the document: an 8-bit alpha mask sized to the canvas
  (0 = unselected). Null mask = whole canvas.
- **Tools:** rectangular, lasso (freeform polygon/path), magic-wand (contiguous
  same-colour within tolerance, flood-style over the composite), select
  all/none/invert; add/subtract modifiers.
- **Tools respect the mask:** all paint/fill/replace ops clip to the selection.
- **Manipulation:** move (lift selected pixels into a floating buffer, translate,
  commit on deselect/confirm), cut/copy/paste (floating), later flip/scale of the
  floating selection.
- **Undo:** via `captureState`/snapshots. Selection itself is editor state (not
  part of the saved PNG).
- Rationale for first: drawing tools, color-replace, and palette-swap-in-region
  all key off the mask.

## 5. Tool framework + drawing toolset

- **Refactor** the flat tool enum into a **tool-strategy** abstraction:
  `Tool { onPointerDown/Move/Up(ctx), preview(), commit() }`, each committing one
  undo snapshot per stroke. Migrate paint/erase/pan/pick into it.
- **New tools:**
  - **Line** — pixel-perfect bresenham (reuse tile-editor line + existing stroke
    smoothing).
  - **Shapes** — rectangle + ellipse, outline and filled.
  - **Flood fill** — contiguous, tolerance, clipped to selection (reuse tile fill).
  - **Color-replace** — replace a target colour with the active colour across the
    layer or selection (global or contiguous variant).
- **Brush model:** `size` (N px), shape (square/round), **custom brushes** (a small
  bitmap stamp sampled along the stroke), **pixel-perfect** strokes (the corner
  de-doubling smoothing already used). **Mirror axes** (X / Y / both) — strokes
  mirrored across a configurable axis line / canvas centre.
- **Document API growth:** `setPixel` → `stampBrush`, `drawLine`, `fillRect`,
  `fillRegion`, `replaceColor`, all selection-aware. Keep the composite/undo
  invariants intact.

## 6. Palettes

- **Palette asset** — a new asset type: a named, ordered list of OKLCH colours,
  saved as a file (editor authors; runtime may later consume for palette-driven
  generation). Listed in `/assets`, created from the context menu.
- **OKLCH ramp generation** — generate N swatches by stepping L, C, and optionally
  H between endpoints (or around a base hue). OKLCH makes these perceptually even
  — a real advantage over RGB/HSL ramps. UI: pick endpoints + steps, preview.
- **Manual editing** — add/remove/reorder swatches, pull from the current colour,
  edit a swatch via the existing OKLCH picker.
- **Swatch panel** in the sprite editor — click a swatch to set the active draw
  colour.
- **Palette swap** — remap the document's (or selection's) distinct colours to a
  target palette: exact match where present, else **nearest in OKLCH distance**.
  Undoable op; document stays RGBA (no indexed mode). Optionally show/edit the
  computed colour→colour mapping before applying.

## 7. Animation authoring (authors `animation.md`)

- **Frame definition** — slice a spritesheet by grid (cell size / cols×rows)
  and/or mark arbitrary rects; frames stored as PNG iTXt metadata (the channel
  shared with tiles/atlas; finalize format with `animation.md`).
- **Clip timeline** — reuse the generic `Timeline`: a clip = ordered frames with
  per-frame durations; **playback**, **looping**, scrubbing. Frame-event tagging
  on the timeline.
- **Onion skinning** — render previous/next frames at reduced opacity behind the
  current frame in the sprite canvas (toggle, configurable range/opacity).
- **Animation-graph editor** — a node/graph view editing the data-condition FSM
  (`state-machine.md`): states (each → a clip), params, transitions with data
  conditions (`speed > 0.1`, `trigger:attack`). **Live preview** drives the
  animator against editable param values. This is the biggest new UI piece.
- Output: spritesheet metadata + clip defs + the animation graph (a serialized
  `StateMachineDef`) — all consumed by the engine Animation system.

## 8. Skeletal workflow — parked (research)

Recorded, intentionally not specced now:

- Concept: draw points/bones in screen space; render pixels along the shapes per
  rules (TBD by the user); enables procedural posing + **weapon attachment
  points** (deferred here from `animation.md`).
- **Open question:** sprite-editor-local feature vs a **global engine system**.
  Attachment points + procedural posing are _runtime_ concerns (a weapon follows a
  rig point), consumed by gameplay/animation and resolved **by entity id** (per
  `no-entity-hierarchy` — no parenting). That points toward the same split as
  Animation: a runtime model + editor authoring, not an editor-only feature.
- Revisit when the posing/render "rules" are defined.

## 9. Layering & integration

- **Editor:** selection, tool framework + tools, palette editor + swap, animation
  authoring UI (frames/timeline/onion-skin/graph). All editor-side
  (`editor-vs-runtime-separate`).
- **Engine:** spritesheet frame-metadata format (shared with `animation.md`);
  palette asset format (data; runtime-consumable later); the animation graph is a
  serialized generic `StateMachineDef`.
- **Editor docking** (`editor-docking.md`): sprite canvas, palette editor, clip
  timeline, animation graph are co-openable dockable **views** (edit frames while
  watching the graph/preview).
- **Undo** stays on the existing `History`/`Command` stack.

## 10. Migration path

1. **Selection foundation** — mask + rect/lasso/wand + move/cut/copy/paste;
   make existing tools selection-aware.
2. **Tool framework** refactor + line/shape/fill/color-replace + brush
   size/custom brushes/mirror.
3. **Palettes** — asset type + OKLCH ramp gen + manual edit + swatch panel +
   palette swap.
4. **Animation authoring** — frame slicing + metadata; clip timeline (reuse
   `Timeline`) + onion skin + frame events; animation-graph editor + live preview.
5. (Future) skeletal + attachment points.

(Animation authoring depends on `animation.md` runtime + `state-machine.md`; the
graph editor edits a `StateMachineDef`. The other clusters are independent.)

## 11. Open sub-decisions / handoffs

- **Spritesheet metadata format** — finalize with `animation.md` (shared iTXt
  channel).
- **Palette asset format** + whether/when runtime consumes palettes (procedural
  generation) — coordinate when that lands.
- **Animation graph editor** is sizeable; could phase (clips/timeline first, graph
  editor second).
- **Skeletal** parked (§8); resolves the deferred attachment-points work.

## 12. Primary files

- New: `editor/sprite/selection.ts`, `editor/sprite/tools/*` (tool strategies),
  `editor/sprite/brush.ts`, palette editor + `editor/palette/*` + palette asset,
  animation authoring views (`editor/animation/*`) over `editor/timeline/`.
- Changed: `editor/sprite/sprite-document.ts` (selection-aware ops, brush/line/
  shape/fill/replace), `editor/sprite/sprite-tools.ts` (→ tool framework),
  `editor/sprite/sprite-editor-state.ts`, asset listing (palette type).
