# Test triage

Point-in-time record of a prune, 2026-07-29. 161 files at the start; 34 game-layer
files were already deleted after their knowledge was salvaged into
`docs/design/implemented-today.md`. This covers the remaining 127.

**The rule:** a test's existence is a claim that the behaviour is locked in. One
question per file — what does this claim is locked, and is it? Coverage was verified
mechanically: every one of the 127 files appears in exactly one section below.

Not a living index. Once the prune is done this is history, not a spec.

## Delete — sprite editor behaviour (44)

Your call already made: the sprite editor is where game sprites should be authored
but isn't where you need it yet, so nothing in it is locked. These claim otherwise.
Several are also synthetic (`content-rect` builds `withOpaque(8, 8, …)`,
`wrap-shift` builds a `ramp(4, 3)`) and so couldn't catch a real bug anyway.

`bake-compositor` · `content-rect` · `custom-brush` · `free-transform` ·
`image-transform` · `onion-skin` · `palette-shading` · `preview-playback` ·
`replace-color` · `resize-nearest` · `rotsprite` · `shading-ink` · `sample-layout` ·
`selection-free-transform` · `selection-transform` · `sprite-alpha-lock` ·
`sprite-attachment-model` · `sprite-attachment-roundtrip` · `sprite-brush-dab` ·
`sprite-brush-dynamics` · `sprite-cel-model` · `sprite-cel-move` · `sprite-dither` ·
`sprite-drawing-tools` · `sprite-flood-fill` · `sprite-gesture-controller` ·
`sprite-gradient` · `sprite-hot-reload` · `sprite-pixel-perfect` · `sprite-scatter` ·
`sprite-selection-controller` · `sprite-selection-mask` · `sprite-shapes` ·
`sprite-stabilizer` · `sprite-stroke-tool` · `sprite-symmetry` ·
`sprite-tool-registry` · `sprite-tool-state` · `sprite-undo-split` · `stroke-buffer` ·
`tile-paint` · `timeline-geometry` · `timeline-navigation` · `wrap-shift`

**Sequencing:** these stay green through the `SpriteEditCore` extraction (step 9 of
`docs/plans/2026-07-29-refactor-host-and-render-unification.md`), because they are the
only thing checking that refactor. Delete after it lands, not before.

## Delete — engine systems in flux (21) — DONE

Weather, VFX, sequences, animation. Your words: heavily in development, and you can't
say what's locked beyond the tile-based nature and the physics core. None of these
covers either of those. **Executed 2026-07-29**; these files are gone.

`animation-ease` · `animation-keyframes` · `animation-timeline` ·
`fast-forward-parity` · `foliage-sway` · `rain-exposure` · `rain-exposure-cache` ·
`sequence-interpreter` · `sequence-skip-halt` · `sequence-weather-override` ·
`vfx-def` · `vfx-effects` · `vfx-render` · `vfx-store-lifecycle` · `weather-audio` ·
`weather-climate` · `weather-edit-world` · `weather-editor-preview` ·
`weather-scheduler`

`camera-serialization` and `tween-elapsed-roundtrip` were in this batch and have been
**restored**: serialization and saving are locked core mechanics, and both assert the
round-trip mechanism rather than an in-flux feature.

Two notes on what stayed deleted. `fast-forward-parity` was on the earlier keep list
because two code paths diverging is invisible, but what it guards is dialogue
fast-forward, and dialogue may be redesigned, so it locks a subject in flux.
`foliage-sway` documented `quantizeToTexel` behaviour worth remembering; that is now in
the GDD's art direction, and the primitive itself is covered by
`quantize-to-texel.test.ts`.

## Keep — file formats (8)

These lock authored _file formats_, not editor behaviour. A codec that writes subtly
wrong bytes corrupts art that loads fine today and breaks months later, which is
invisible until it isn't.

| File               | What it claims is locked                                             |
| ------------------ | -------------------------------------------------------------------- |
| `png-codec`        | PNG encode/decode round-trips                                        |
| `bsprite-writer`   | the `.bsprite` archive we write is readable and correctly structured |
| `bsprite-load`     | archives on disk parse into manifests                                |
| `bsprite-classify` | byte-sniffing tells a `.bsprite` from other archives                 |
| `kbd-bsprite`      | the committed keyboard-glyph sheet matches what code expects         |
| `ora-import`       | OpenRaster files from other tools import correctly                   |
| `pdn-import`       | Paint.NET files import correctly                                     |
| `palette-gpl`      | GIMP palette files parse                                             |

## Keep — provenance tripwires (8)

Silent corruption of authored data. AGENTS.md designates most of these as tripwires
by name.

| File                            | What it claims is locked                                       |
| ------------------------------- | -------------------------------------------------------------- |
| `run-contamination`             | runtime-spawned entities never leak into the authored document |
| `run-lockdown`                  | edits during a run can't reach the document                    |
| `scene-document-save`           | a saved `.scene.json` round-trips and matches a replay         |
| `weather-provenance`            | weather run-state never reaches an authored scene file         |
| `scene-migrations`              | authored data isn't silently dropped by a migration            |
| `deserialize-unknown-component` | an unknown component is skipped visibly, not silently          |
| `journal-dirty`                 | dirtiness measures against the save point, so undo reads clean |
| `vfx-snapshot`                  | the deliberate VFX non-restore stays deliberate                |

## Keep — locked editor features (15)

Tabs, dragging, multiple windows, the console, and the document/history pattern —
all on your locked list. Quality caveats noted where they apply.

| File                    | What it claims is locked                                                                              | Note                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `workspace-windows`     | tearing a view into a satellite, docking across windows, merging back, refusing to merge the hub away |                                                                 |
| `drop-action`           | what a tab drop resolves to: spawn, reorder, move-in-window, move-across, no-op                       |                                                                 |
| `hit-test`              | client→screen mapping under zoom, and which drop target a drag resolves to                            |                                                                 |
| `dock-zones`            | the five-way dock partition covers the rect with no dead area                                         | synthetic geometry, but it caught a real unreachable-zone bug   |
| `closed-stack`          | reopen-closed-view: dead views pruned, already-open wins, bounds round-trip                           |                                                                 |
| `command-routing`       | a command resolves the scene view of its own window, not globally                                     |                                                                 |
| `view-bar-state`        | a singleton view reads here / elsewhere / closed per window                                           |                                                                 |
| `scoped-hotkeys`        | hotkeys bind to the owning window's document                                                          |                                                                 |
| `dirty-guard`           | closing the hub aggregates dirty docs across windows; a satellite lists only its own                  |                                                                 |
| `structural-validity`   | persisted view ids survive boot by shape, then prune against real lists                               | this is the fix for the boot-prune bug that dropped asset views |
| `scene-view-identity`   | one view per scene, and legacy suffixed ids are dropped on load                                       |                                                                 |
| `console-capture`       | consecutive identical logs fold with a count; args are snapshotted against later mutation             |                                                                 |
| `console-snapshot`      | snapshots are mutation-immune and survive circular references                                         |                                                                 |
| `document-store`        | entries key by view id, survive remount, reload on key change, dispose cleanly                        |                                                                 |
| `history-transactional` | a failed undo doesn't move the cursor and surfaces the error                                          |                                                                 |

## Scene view (12) — RESOLVED

Ruled 2026-07-29: anything related to **selection** is a keeper, and so is **edit
journalling**. That keeps ten of these, including picking (which is how selection
happens) and the composite/poke routing (both selection fan-out and journalling).
Deleted: `scene-view-drop` (asset-drop placement, not selection) and `snapping` (the
drag snap resolver; `entity-manipulation` still covers snapping at the drag level).

| File                        | What it claims is locked                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `entity-manipulation`       | group move commits one composite, Alt-drag duplicates, marquee box-selects, empty click clears, Ctrl escapes snapping |
| `snapping`                  | nearest salient point snaps to grid, smart guides beat the grid when closer                                           |
| `selection-model`           | multi-select semantics: anchor, primary, toggle fallback, range spans                                                 |
| `selection-channel`         | late-resolution binding when the id isn't resolvable yet                                                              |
| `editor-hover-channel`      | hover wakes only the hover channel, never the coarse store                                                            |
| `pick-index`                | topmost-smallest-area wins, and the index stays correct across undo, commit, and run-stop rebuild                     |
| `pick-sprite-bounds`        | AABB is a tiny fallback pre-load and full sprite bounds after                                                         |
| `pick-index-invalidate-url` | invalidating a url recomputes only that entity's bounds                                                               |
| `undo-reselect`             | undo restores the selection at each cursor position and drops deleted ids                                             |
| `undo-during-run`           | stopping a run leaves the edit world equal to the document projection                                                 |
| `composite-routing`         | a mixed selection splits into journaled authored edits and live-only pokes                                            |
| `scene-view-drop`           | a sprite drop creates exactly Transform + Sprite; a bad prefab toasts rather than no-oping                            |

Worth knowing: `undo-during-run` and `composite-routing` are arguably provenance
guards wearing scene-view clothes — what they protect is the document not being
contaminated by a run, which is the invisible-failure category.

## Yours — engine (17 still open)

The grey area you described: the engine exists to keep three clean projects, but it
drives real behaviour and you don't want to build on untested foundations. Nothing
here covers the two things you named as locked — **no test asserts physics behaviour
at all.**

Tiles were ruled on separately. Baking is performance-critical and edits should be
batched, so a test making _that_ statement is wanted and anything tile-related that
doesn't is not. `tilemap-rebake` covered a three-line dirty-check helper rather than
batching, and `tileset-width` isn't about baking at all — both deleted. **Owed: a test
asserting that N tile edits in one frame produce one rebake.** Nothing covers it today.

| File                      | What it claims is locked                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `render-blend`            | normal and additive blend factors, plus `quantizeToTexel`'s rounding                                   |
| `renderer-registry`       | invalidation fans out to every registered renderer and stops at unregistered ones                      |
| `renderer-resource-cache` | per-renderer entries, and context rebuild recreates without double-firing                              |
| `resolve-sprite-draw`     | `.bsprite` resolves through the facade sheet, legacy PNG through `getImage`                            |
| `viewport-owner-document` | the backing store sizes to the owning window's DPR, and reattach recreates in the destination document |
| `asset-manager-evict`     | evict clears image and facade together, in-flight loads can't resurrect, errors become retryable       |
| `sprite-asset`            | manifest parsing from the archive, and attachment lookup per frame                                     |
| `sprite-tag-playback`     | looping advances by per-frame durations and wraps; non-looping clamps and finishes                     |
| `entity-top`              | anchors to a `.bsprite` content rect that `getImage` cannot measure                                    |
| `trigger-volume`          | one-shot consumes, repeat never does, chronicle flags gate entry                                       |
| `ui-node-removal`         | focus survives unmount and re-resolves to the chain neighbour                                          |
| `ui-stick-focus-consume`  | a stick move the UI spends is consumed; one it can't reaches gameplay                                  |
| `ui-world-anchor-paint`   | world-anchored nodes anchor by top-left and wait for a measured width                                  |
| `frame-profile`           | per-system labels record and reset per frame; disabled leaves the loop untimed                         |
| `perf-history`            | the sample window caps and drops oldest; displayFps latches once a second                              |
| `game-composition-boot`   | the real game path boots and spawns a player and a scene prefab                                        |
| `sequence-harness`        | the harness itself boots a runtime and survives capture/restore                                        |

Three of these I'd argue for keeping regardless of the engine question.
`game-composition-boot` is the only test that would catch a broken registration or a
composition that throws on boot — it's a smoke test, not a behaviour lock.
`viewport-owner-document` guards multi-window DPR wiring, which is on your locked list.
`entity-top` is the interesting one: its setup is real (a committed `player.bsprite`,
real content rects) but its assertion is `y - height/2 - gap`, the function's
arithmetic transcribed — so it passes the real-data bar and fails the outcome bar.

## Where this lands

|                               | Files |
| ----------------------------- | ----- |
| Already deleted (game layer)  | 34    |
| Delete — sprite editor        | 44    |
| Delete — engine in flux       | 21    |
| Keep — file formats           | 8     |
| Keep — provenance tripwires   | 8     |
| Keep — locked editor features | 15    |
| Yours — scene view            | 12    |
| Yours — engine                | 19    |

## Final state

**93 files, 589 tests, 1.85s.** Down from 161 files, 1119 tests, 9.07s.

44 of those 93 are the sprite-editor batch, held only as the safety net for the
`SpriteEditCore` extraction. Once that lands and they go, **49 files remain**.

Rulings made after the first pass, in order:

- Selection and edit journalling are keepers, so ten scene-view files stayed and
  `scene-view-drop` plus `snapping` went.
- Tiles: baking is performance-critical and edits should be batched, so a test making
  that statement is wanted; `tilemap-rebake` and `tileset-width` didn't and went.
- Blend factors have no authored consumer (built for fire VFX, nothing uses
  `"additive"`), so `render-blend`'s blend half went. Its `quantizeToTexel` half moved
  to `quantize-to-texel.test.ts`, since that primitive now underpins the art direction.
- Triggers, and the perf-measurement widgets (`frame-profile`, `perf-history`) which
  lock widget behaviour rather than measuring anything, went.
- Serialization and saving are locked core mechanics, so `camera-serialization` and
  `tween-elapsed-roundtrip` were **restored** after being deleted in the in-flux batch.
- `AssetManager` is load-bearing but has a queued rework
  (`2026-07-12-refactor-asset-resolution-core.md`, plus the roadmap's reconciliation
  item), so its three tests went and get rewritten after that plan lands.
- The three `engine/ui` tests stayed as the base for a holistic UI suite covering focus
  semantics, accessibility, alignment and rendering.
- `game-composition-boot` stayed. It asserts no serialization despite the name
  suggesting otherwise; it is kept as the only guard against a broken registration or a
  composition throwing on boot.
- `entity-top` and `sequence-harness` went.

## Owed

What this prune is buying, and the real output of the exercise. Nothing here exists
today.

| Owed                                                                          | Why nothing covers it                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Physics core behaviour**                                                    | no test has ever asserted physics, and it is as locked as anything in the project |
| **Tile edit batching:** N edits in a frame produce one rebake                 | `tilemap-rebake` covered a dirty-check helper; this was a real bug once           |
| **Renderer batching, particle stress, perf under load**                       | the deleted renderer tests covered registry and cache plumbing, not throughput    |
| **A holistic UI suite:** focus semantics, accessibility, alignment, rendering | the three surviving tests are narrow; none drives a real tree                     |
| **Asset resolution and eviction**                                             | after the asset-resolution plan lands                                             |
| **Inspector, asset browser, font inspector**                                  | zero tests, all on the locked list                                                |
