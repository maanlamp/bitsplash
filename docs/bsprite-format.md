# `.bsprite` format — shared contract (v1)

This is the binding interface between the editor (sole writer) and the engine
(reader). Both sides build against this document; changes here are changes to the
contract.

## What it is

`.bsprite` is a **zip container** (STORED + DEFLATE entries, written with
`fflate`, already an engine dependency). It holds:

- a **JSON manifest** describing layers, frames, cels, tags, and metadata;
- **layer-cel PNGs** — the authored, per-layer pixel data;
- **baked flattened frame PNGs** — the composite of all layers for each frame,
  written by the editor at save time.

The single most important rule: **the engine reads only the manifest and the
baked frames.** It never sees layers, never composites, never evaluates a blend
mode. Compositing happens exactly once — in the editor, on the CPU canvas path
(`willReadFrequently: true`), deterministically per document version. The bake
is authoritative for everything the game renders.

## Container layout

```
manifest.json                     DEFLATE  — the manifest below
layers/<layerId>/<frame>.png      STORED   — one cel; present only where a cel exists
bakes/<frame>.png                 STORED   — one flattened frame; one per frame, always present
```

- `<layerId>` is the layer's **stable id** (see `Layer.id`), never its name.
  Renaming a layer must not move its cel entries. (Unity's Aseprite-importer
  lesson: key layers by stable id, not by name.)
- `<frame>` is the zero-based frame index as a decimal string (`0`, `1`, …).
- **Cels are sparse.** A (layer, frame) pair with no authored pixels has no PNG
  entry and no `cels[]` entry; it is treated as fully transparent.
- **Bakes are dense.** Every frame `0..frames.length-1` has exactly one
  `bakes/<frame>.png`, sized to the canvas (`width`×`height`).

### Compression & byte-stability

- **Cel and bake PNGs are STORED** (stored uncompressed in the zip). The PNG
  bytes are themselves the compression; storing them avoids double-compression
  and — critically — keeps them **byte-identical** across saves.
- **The manifest is DEFLATE.**
- **Dirty-frame byte-copying:** on save, a cel or bake whose pixels did not
  change since the archive was loaded is copied **byte-verbatim** from the
  previously-loaded archive rather than re-encoded. A metadata-only edit (e.g.
  renaming a tag, retagging frames, changing durations) therefore diffs **only
  `manifest.json`** — the PNG entries are bit-for-bit unchanged, so git diffs
  stay proportional to the actual pixel edits.

### Corruption safety

A zip's central directory lives at EOF; a torn write loses the whole archive.
`.bsprite` files are therefore **only ever written through the atomic-write IPC**
(`writeAssetAtomic`, see the plan's step A2): temp file in the destination dir →
fsync → atomic rename. Never write a `.bsprite` with a plain streamed write.

## Manifest

`manifest.json` is a single JSON object. Field-by-field (a field is present in
v1 only if it has a shipping consumer):

```jsonc
{
	"version": 1,

	"width": 55, // canvas width in pixels (int > 0)
	"height": 55, // canvas height in pixels (int > 0)

	"layers": [
		// bottom-to-top paint order (index 0 painted first)
		{
			"id": "a1b2c3d4", // stable id, unique within the document
			"name": "Layer 1", // display name; not an identity key
			"opacity": 1, // 0..1
			"visible": true,
			"blend": "source-over", // a BlendId (see below)
		},
	],

	"frames": [
		// one entry per frame, in playback order
		{ "duration": 100 }, // display duration in **milliseconds** (int > 0)
	],

	"cels": [
		// present cels only (sparse); absent = transparent
		{ "layer": "a1b2c3d4", "frame": 0 },
	],

	"tags": [
		// named frame ranges for playback
		{ "name": "idle", "from": 0, "to": 3, "loop": true },
	],

	"contentRects": {
		// per-tag; derived at bake (see below). optional per tag
		"idle": { "x": 22, "y": 15, "width": 17, "height": 33 },
	},

	"attachments": {
		// named per-frame points (see below). optional
		"grip": {
			"0": { "x": 30.5, "y": 28 },
			"1": { "x": 31, "y": 27 },
		},
	},

	"slice": {
		// 9-slice insets. present only for 9-slice sprites
		"left": 5,
		"right": 5,
		"top": 4,
		"bottom": 7,
		"gap": 0,
	},

	"tileset": {
		// presence = tileset identity (see below). optional
		"columns": 3,
	},
}
```

### `layers`

Ordered bottom→top: `layers[0]` is painted first (backmost). `id` is the stable
key used in cel paths and `cels[]`. `blend` is a `BlendId` string; **only the
editor reads it** (for live preview and bake). `opacity` is a straight `0..1`
scalar. This mirrors today's `SpriteDocument` layer shape, minus the live
canvas handles.

### `frames`

Index-aligned with `bakes/<frame>.png`. `duration` is per-frame milliseconds.
This replaces `SpriteClip.fps` — a uniform-fps clip becomes N frames all sharing
one duration; a hold-frame becomes a 1-frame tag. There is **no `fps: 0` hack**:
an unanimated state is a 1-frame tag.

### `cels`

The set of (layer, frame) pairs that have authored pixels, each backed by
`layers/<layer>/<frame>.png`. Any pair not listed is transparent. The bake for a
frame is the composite of that frame's cels through the layer stack; the engine
never reconstructs it.

### `tags`

A tag is a named, inclusive frame range `[from, to]` with a `loop` flag. Tags are
the engine's playback unit (see "Playback contract"). `from`/`to` are frame
indices into `frames`. Ranges may overlap; `from <= to`.

Deferred (schema additions when a consumer appears — no ceremony): tag
`direction`/`repeat`, linked cels, pivot, per-frame hitboxes, palette/indexed
color, layer groups, clipping masks.

### `contentRects` — derived at bake, per tag

At bake time the editor computes, for each tag, the **union of the alpha
bounding boxes of that tag's baked frames**, and stores it as
`contentRects[tagName]`. This replaces the hand-authored
`contentX/contentY/contentWidth/contentHeight` on `SpriteClip`.

- **Per-tag, not per-frame** — a single rect per tag keeps centered rendering
  from wobbling frame to frame.
- Coordinates are canvas pixels: `x`,`y` top-left, `width`,`height` extent.
- A tag whose frames are entirely transparent has no entry; the consumer falls
  back to the full canvas rect (`0,0,width,height`).
- Absent tag (legacy / untagged playback) → full canvas rect.

### `attachments` — named per-frame points

`attachments[name]` maps a **frame index (decimal string key)** to a point
`{ x, y }`. Points are **floats in full-canvas pixel space**: origin at the
canvas top-left, `+x` right, `+y` down, same space as `width`/`height`.

- **Sparse per frame.** A frame with no entry for a point is _absent_: the
  engine query `spriteAttachment(name)` returns `undefined` for that frame.
  **There is no nearest-frame fallback** — the consumer decides its own default.
- **Authored, unmirrored coordinates.** The query returns the point exactly as
  stored, in unmirrored full-canvas pixel space. The editor authors points in
  this same space, so placement and query agree by construction.
- **flipX mirroring is a consumer concern, about the content-rect center.** A
  `.bsprite` renders with the active tag's **content rect** centered on the
  entity (not the canvas centered), and a mirrored (`SpriteComponent.flipX`)
  sprite is mirrored about that content-rect center. The attachment query does
  **not** pre-mirror x. The consumer that converts a point to a world offset
  mirrors it about the content-rect center — in practice by negating the x
  component of the center-relative offset (`attachmentWorldOffset`). Mirroring
  about the canvas center instead (a naive `width - x`) is wrong by
  `width - 2·contentCenterX` whenever the content rect is not canvas-centered.

v1 consumer: the bow grip point on the player (replacing a hardcoded center +
magic offset), with an optional nock point on the bow for arrow spawn.

### `slice` — 9-slice insets

Present only for 9-slice sprites. Shape is exactly `NineSliceInsets`
(`src/engine/render/nine-slice.ts`): `{ left, right, top, bottom, gap? }` in
pixels. v1 consumers: `kbd-frame.ts` and `dialogue-hud-sync-system.ts` after
`kbd.9slice.pdn` migrates to `kbd.bsprite`. This replaces the PNG `iTXt`
`bitsplash` chunk (`src/engine/png-metadata.ts`), which had readers but no
writer anywhere — that reader path is **deleted** when `kbd` migrates, not
paralleled.

### `tileset` — presence is identity

**The presence of the `tileset` block classifies the asset as a tileset.** This
is the manifest-driven replacement for filename-suffix detection
(`isTilesetName` / `.tileset.png`). For `.bsprite`, classification reads the
manifest, not the name; suffixes remain a human-facing convention only.

- `columns`: number of tile columns across the sheet width
  (`width % columns === 0` must hold). `columns === SHEET_COLUMNS` (currently 3)
  marks an autotile-compatible sheet, matching the existing 3-column autotile
  layout (`src/engine/tilemap/autotile.ts`).
- Filename-suffix detection (`isAutotileTileset`, the `.tileset.png` path)
  **survives only for legacy `.png`** assets. New `.bsprite` tilesets are
  classified by this block.

## Blend modes (`BlendId`)

`blend` is one of the following string ids. **The engine never evaluates any of
them** — they exist so the editor can round-trip layer intent and so importers
can preserve source-file blend modes. The editor compositor is hybrid: canvas2d
`globalCompositeOperation` for the native set, an integer per-channel pixel loop
for the legacy set. Both the bake and the live preview use the same compositor,
so they agree by construction.

### Native (canvas2d `GlobalCompositeOperation`, 17)

The set already curated in `src/editor/sprite/blend-modes.ts`:

`source-over` (Normal), `multiply`, `screen`, `overlay`, `darken`, `lighten`,
`color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`,
`exclusion`, `hue`, `saturation`, `color`, `luminosity`, `lighter` (Add).

### Legacy pixel-math (5, for pdn/aseprite parity)

Evaluated by an integer per-channel loop over straight-alpha RGB (coverage/alpha
composites source-over). `b` = backdrop channel, `s` = source channel, each
normalized to `0..1`; result clamped to `0..1` then back to `0..255`:

| BlendId    | Label    | Per-channel formula                   |
| ---------- | -------- | ------------------------------------- |
| `subtract` | Subtract | `max(0, b - s)`                       |
| `divide`   | Divide   | `s === 0 ? 1 : min(1, b / s)`         |
| `reflect`  | Reflect  | `s === 1 ? 1 : min(1, b*b / (1 - s))` |
| `glow`     | Glow     | `b === 1 ? 1 : min(1, s*s / (1 - b))` |
| `negation` | Negation | `1 - abs(1 - b - s)`                  |

These ids are outside the `GlobalCompositeOperation` union, so `BlendId` is a
superset of the canvas type. The editor maps native ids straight through to
canvas and dispatches legacy ids to the pixel loop.

## Playback contract (engine)

When a `SpriteComponent.urlRef` points at a `.bsprite`:

- `clips` is unused; playback is driven by **tags**. `SpriteComponent.current`
  selects the active tag by name (same field games already set).
- A tag-playback system advances `SpriteComponent.frame` using per-frame
  `frames[i].duration` (milliseconds), honoring the tag's `loop` flag.
- On a non-looping tag reaching its last frame, `SpriteComponent.finished`
  becomes `true` — exactly the contract `player-animation-system.ts` already
  reads for PNG `SpriteClip` playback.
- `spriteSource` resolves through the facade's composed sheet layout and the
  tag's derived content rect. Consecutive-same-texture batching and the existing
  `spriteSource` frame math are preserved.
- The legacy PNG / `SpriteClip` / `SpriteAnimationSystem` path is **untouched**
  for `.png` sprites. The two paths coexist; a component is in one mode or the
  other based on whether `urlRef` resolves to a `.bsprite`.

## Reading (engine `SpriteAsset` facade)

The engine reads a `.bsprite` through one facade (in the `engine/sprite` slice):
fetch → `fflate` unzip → decode the **baked** frame PNGs → compose them into a
single sheet canvas at load (a `HTMLCanvasElement`, already a valid `TileSource`;
no `createImageBitmap`, so no `TileSource` widening needed), laid out so existing
`spriteSource` frame math and consecutive-same-texture batching keep working. The
facade also exposes the manifest metadata (content rects, attachments, slice
insets, tileset block). Legacy PNGs continue through the image + `iTXt` path
until each file migrates.

## Writing (editor)

Exactly one writer: the editor's `.bsprite` serializer. It composites each
frame's cels through the layer stack (native + legacy blend), writes the bakes,
copies unchanged cel/bake entries byte-verbatim from the loaded archive
(dirty-frame tracking), derives per-tag content rects from baked alpha bounds,
and emits the manifest. The bytes go to disk only through `writeAssetAtomic`.
