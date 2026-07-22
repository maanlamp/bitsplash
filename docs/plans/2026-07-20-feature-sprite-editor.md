# Sprite Editor & `.bsprite` Format

- **Type:** feature
- **Date:** 2026-07-20
- **Status:** accepted

## Goal

Make the built-in sprite editor the place where bitsplash art is actually authored: a layered, animated, metadata-carrying `.bsprite` format owned end-to-end (editor writes it, engine plays it), plus the drawing/selection/animation toolset that makes alt-tabbing to Aseprite/paint.NET unnecessary. The stated bottleneck this removes: **no animation support at all** — and the editor-wide hot-reload loop that no external tool can offer.

## Context & problem

- Layers are a session-only illusion: `SpriteDocument` holds live canvases but `save()` flattens via `composite.toBlob()` into a single PNG (`src/editor/sprite/sprite-document.ts:301-311`). Reload gives one layer back. Layered sources live in committed `.aseprite`/`.pdn` files as a workaround.
- Three tools exist (1px brush, eraser, pan). No selection, no fill, no shapes, no palettes, no animation. Authoring happens in Aseprite (disliked as drawing software) and paint.NET (no animation).
- PNG is overloaded as a carrier: animation via one-strip-PNG-per-clip with frame math hand-duplicated in every prefab (`SpriteClip` in `src/engine/sprite/sprite-component.ts`), 9-slice via a PNG iTXt chunk that **nothing in the repo can write**, tilesets via filename suffix.
- Known defects: brush paints offset from the cursor (CSS-px fed into a backing-store-px transform, `texture-panel.tsx:117-121`), brush cursor invisible on same-colored pixels, layers panel laid out as an unusable space-between column.
- Hot reload does not exist: `AssetManager` (`src/engine/assets.ts`) caches forever with no invalidation API; a saved sprite is invisible to open scene views until app restart.
- Tablet pressure is ignored; the editor needs a real toolbar for view-level commands (floating toolbars are tools-only by design).

Constraints: strict layering (Engine ← Editor, Engine ← Game); vertical feature slices; existing PNG art and rendering paths stay untouched except where a file is explicitly migrated ("if we migrate, we migrate" — no compatibility shims for migrated files); nothing ships without a consumer.

## Decision

**Own the format.** `.bsprite` is a zip container (fflate, already an engine dependency via `.font.zip`): layer-cel PNGs stored STORED, a JSON manifest, and **baked flattened frame PNGs written at save time by the editor** (ORA's `mergedimage.png` generalized per frame). The engine is a first-class reader of `.bsprite` — but it reads _only_ baked frames + manifest and never composites layers or sees blend modes. Compositing happens exactly once, in the editor, on the CPU canvas path (`willReadFrequently`), deterministically per version rather than per GPU.

**Manifest carries (v1 — every field has a shipping consumer):**

- format `version` int (plain future-proofing, no deferral ceremony — fields are added whenever a new consumer appears)
- canvas size; layers: name, opacity, visibility, blend mode — the 17 modes already curated in `src/editor/sprite/blend-modes.ts` (the W3C set canvas2d implements natively) **plus the legacy pixel-math modes** needed for pdn/aseprite parity (Subtract, Divide, Reflect, Glow, Negation; one-line per-channel formulas). The editor compositor is hybrid: canvas2d for native modes, integer pixel loop for the legacy ones (both bake and live preview). The engine never evaluates any of them
- frames with per-frame duration ms; cels (layer × frame); tags: name, frame range, loop flag
- per-tag **content rects, derived at bake** (union of frame alpha bounding boxes — replaces hand-authored `contentX/Y/Width/Height`; per-tag not per-frame so centered rendering doesn't wobble)
- named per-frame **attachment points** (consumer: the bow — grip point on the carrier, replacing center + magic offset)
- 9-slice insets (consumer: `kbd-frame.ts`, `dialogue-hud-sync-system.ts` after `kbd` migrates)
- tileset parameter block; **presence of the block = tileset identity** (manifest-driven classification; filename suffix detection survives only for legacy `.png` paths)

**Deferred until a consumer exists** (plain schema additions later): tag direction/repeat, linked cels, pivot, per-frame hitboxes (physics owns collision — decided), indexed color/palette power features, layer groups, clipping masks.

**Playback**: a new engine tag-playback path plays `.bsprite` tags (per-frame ms, loop, `finished` exposed exactly as today's `sprite.finished`). Existing `SpriteClip`/`SpriteAnimationSystem` stay untouched for PNG sprites. Proving consumer: **the actor strips migrate to `player.bsprite`** in this plan (via the `.aseprite` importer — dogfood). The player's nine clips come from six strips (`idle`, `run`, `run-backwards`, `jump`, `falling`, `contact`; `wallslide`/`dash`/`walljump` are `fps:0` freeze-frames aliasing `run`), and those strips are shared by seven other prefabs — so **all eight prefabs** (`player`, `companion`, `critter`, `enemy`, `guard`, `pickup-tutor`, `quest-giver`, `quickfoot`) rewrite to `player.bsprite` tags, and the strip PNGs + `.aseprite` sources are deleted (decided: no duplicate art, "if we migrate, we migrate"). The `fps: 0` hold-frame hack dies: unanimated states become 1-frame tags.

**Hot reload**: save → `AssetManager.evict(url)` (new) → consumers re-poll and self-heal. Evict-and-blink semantics (chosen: no keep-old-until-ready machinery). Editor-internal; the separate Electron game window is out of scope.

**Editor**: full drawing/selection/animation toolset per the triage (details in steps), built on three foundations that must land first — a tool-strategy architecture (the 3-value enum can't carry ~20 tools), a stroke-buffer pipeline (sized brushes/shapes/opacity-correct strokes need draw-to-temp-commit-on-release), and an undo split (structural commands with real inverses + cel-scoped pixel snapshots; today's whole-document snapshots would cost ~16 MB per layer-rename under a cels model).

**Saves**: a new binary atomic-write IPC endpoint (unique temp name in same dir → fsync file → rename with bounded retry; no parent-dir fsync on Windows; per-path queue in main). All asset writes migrate to it (sprite create-new and audio editor included) so no torn-write path remains. No autosave/crash recovery in v1 (unsaved-work protection is the roadmap's holistic dirty-state item).

## Alternatives considered

- **Import `.aseprite`/`.pdn` as the authoring format** (build-time or runtime): rejected — runtime `.aseprite` parsing is a moving target with no JS writer ecosystem; Aseprite CLI export needs a licensed/self-built binary per machine; `.pdn` is workable read-only but paint.NET stays a tool we're trying to leave. Community evidence says importers solve sync-pain but leave authoring in a disliked tool.
- **ORA as the native format**: rejected — no animation model, no tags/slices/palette, dead JS ecosystem, 20-year draft spec. Its container shape (zip of PNGs + XML + merged image) is exactly what `.bsprite` borrows.
- **Engine composites layers at load** ("no derived data anywhere"): rejected by critique — the WebGL compositor knows 3 blend modes (mismatched math, `src/engine/render/blend.ts`), so load-time compositing means canvas2d work on every launch with browser/GPU-variant results. Bake-at-save is single-writer, deterministic, and provenance-by-construction in this repo's own style.
- **Loose directory instead of zip**: more git-friendly, but loses the one-file artifact; zip + STORED PNGs + dirty-frame byte-stable rewrites keeps diffs proportional to actual edits. Accepted trade.
- **Suffix-based classification for `.bsprite`** (`.tileset.bsprite` as code-level identity): rejected — a self-describing container should self-describe; sync name-only classification is an implementation artifact fixable by enriching the main-process listing. Suffixes remain human-facing convention only.
- **Derived-cache import pipeline** (Unity/Godot-style build step): rejected for now — engine-primitive reading of the authored file keeps one artifact and zero pipeline stages; bake-at-save recovers the load-cost benefits a cache would have provided.
- **Pop-out window for editor space**: deferred to its own plan (universal tear-out, Chrome/VS Code semantics — see roadmap). This plan only avoids creating new window-singleton assumptions.

## Approach / steps

Two parallel-capable workstreams first (shared contract: the `.bsprite` schema, written down as a short spec in `docs/` before either side builds against it), then serial feature phases. Every phase boundary leaves a coherent, shippable editor.

### Workstream A — Format & engine spine

1. **Schema spec**: write the manifest JSON shape (fields above) as `docs/bsprite-format.md`. Include container layout (`manifest.json`, `layers/<layerId>/<frame>.png` cels, `bakes/<frame>.png`), the byte-stability rule, and attachment/9-slice/tileset semantics incl. flipX mirroring for attachment points and absence semantics: `spriteAttachment()` returns `undefined` when the current frame lacks the named point — no nearest-frame fallback; the consumer decides its own default.
2. **Atomic save IPC** (`src/desktop/main.cjs`, `preload.cjs`, `src/project-rpc.ts`): binary `writeAssetAtomic` endpoint (ArrayBuffer over structured clone); unique temp in destination dir, fsync, rename with bounded EPERM retry, per-path promise queue. Migrate all `uploadAsset` callers (sprite save/create, audio editor, and `importAbsolutePath` in `src/editor/project-io.ts` — the external-asset drag-import) to it; delete the base64 channel.
3. **`.bsprite` writer** (editor side, `src/editor/sprite/`): serialize document → zip via fflate (STORED cel/bake PNGs, deflated manifest). Dirty-frame tracking: unchanged cels and bakes are copied byte-verbatim from the previously loaded archive so a retag save diffs only the manifest. Bake compositing on CPU canvas (`willReadFrequently: true`), deriving per-tag content rects from frame alpha bounds.
4. **`SpriteAsset` facade** (`src/engine/sprite/` — it joins the sprite slice per the vertical-slice rule): one accessor for pixels + metadata for both worlds — `.bsprite` (fetch → fflate → decode baked frames → compose into a single sheet canvas at load, preserving `spriteSource` frame math and consecutive-same-texture batching; widen `TileSource` if `createImageBitmap` is used) and legacy PNG (image + iTXt metadata). Own cache with eviction. 9-slice consumers (`kbd-frame.ts`, `dialogue-hud-sync-system.ts`) switch to the facade; the iTXt reader path is deleted when `kbd` migrates, not paralleled.
5. **Eviction & hot reload** (`src/engine/assets.ts` + renderer plumbing): `evict(url)` with generation tokens (in-flight stale loads can't resurrect), errored entries become retryable, metadata/manifest cache keys evict together with pixels. Pick-index dirtied by URL (`pick-index.ts`). Tilemap rebake trigger: bake entry records the tile-array `rows` it was built from; poll compares. Tile-array invalidation fans out via a registry of live `Renderer2D` instances (scene views + preview games) so `invalidateTileArray(oldImage)` reaches every GPU cache; old entries freed. Editor save path calls evict on the shared editor `Game.assetManager`.
6. **Tag playback**: `SpriteComponent` gains a manifest-tag mode — when `urlRef` points at a `.bsprite`, `clips` is unused and a tag-playback system (new system in `src/engine/sprite/`) advances `frame` from manifest per-frame durations, sets `finished` on non-loop completion, exposes the same `current`/`playing` contract game systems already read. `spriteSource` resolves through the facade's sheet layout + derived content rects. PNG/`SpriteClip` path untouched.
7. **Classification & plumbing**: main-process asset listing parses `.bsprite` central directory + manifest (mtime-cached, per-file try/catch → `unknown` on corrupt zip); `listDir` enriched with kind for the asset browser's sync dragstart; `classifyAsset` consumes it; thumbnails extract baked frame 0; `openImageDialog` filters gain `.bsprite`; Vite `assetsInclude` + game-window MIME entries; editor-side byte reads go through bridge IPC (and fix the stray `project-io.ts:123` fetch). Engine tileset-ness reads the manifest block via the facade; `isAutotileTileset` path check remains for legacy `.png` only. Editor tileset-vs-sprite mode becomes a document property (replaces `isTilesetName(param)` at `app.tsx:1224` and the view-icon check).

### Workstream B — Editor foundations (parallel with A)

8. **Coordinate fix**: shared `clientToCanvas(element, clientX, clientY)` helper scaling by `canvas.width / rect.width` (not `devicePixelRatio` — Electron zoomFactor makes DPR machine-dependent and rounding diverges). Fix all four call sites: `texture-panel.tsx`, `game-view-panel.tsx`, `scene-view-panel.tsx` ×2. Note: engine-input-driven interactions (`sprite-camera.ts`, tile editor) are already correct via `input.mouse.position`.
9. **Cursor**: hide OS cursor over the canvas; render a negative/XOR brush outline + highlighted pixel cell (Aseprite's "negative black & white" + Piskel's cell highlight). Kills the same-color-invisibility gripe.
10. **Tool architecture**: replace the 3-value `SpriteTool` union with tool strategies (`onDown/onMove/onUp/preview/cursor/options` per tool) plus orthogonal modifiers (inks: normal/alpha-lock/shading; symmetry; pixel-perfect; stabilizer) so ~20 tools compose instead of special-casing. Includes hold-key temporary tool switch (push/pop tool state) as an experiment.
11. **Stroke buffer**: strokes draw to a temp cel composited for preview, committed on release — prerequisite for sized brushes, shapes, gradients, opacity-correct strokes, and stabilization.
12. **Undo split**: structural commands (add/delete/reorder/rename layer, add/delete/move cel, tag/timing edits — metadata-only, real inverses) + pixel commands (cel-scoped ImageData snapshots). Defined interactions: undo restores selection state; an uncommitted floating selection/transform commits before an unrelated command executes. Replaces the whole-document `captureState()` in `layer-commands.ts`.
13. **Top toolbar primitive**: a docked flex-row view-toolbar component (base-ui `menu`/`menubar`/`toolbar` — verified present in 1.5.0) for view-level commands (flip/rotate whole image, view toggles, editor settings) — a new shell-agnostic primitive rendered inside the view, no workspace changes needed. Floating toolbar stays tools-only and gains wrap/reflow when its parent is too small. Editor-wide adoption audit is a roadmap follow-up.

### Phase 1 — Document model & animation (the bottleneck)

14. **Cels document model**: `SpriteDocument` rewritten around layer × frame cels with the new undo. The composite canvas object identity must stay stable across recomposites (it keys renderer caches and the tileset preview subscription — `game-view-panel.tsx:82-84`); if a rewrite must swap it, add an identity-change hook and re-subscribe consumers.
15. **`.bsprite` load/save wired** into `useDocumentEditor` flow; `NewSpriteDialog` creates `.bsprite` documents; `onAssetCreated` handles the new kind; legacy PNGs still open (single layer, single frame) and can be saved-as-`.bsprite`.
16. **Timeline UI**: frames × layers grid (the rebuilt layers panel is this grid's vertical axis — one component, fixing the space-between layout), per-frame duration editing, tag create/rename/range/loop, frame add/delete/reorder, cel drag.
17. **Onion skinning** (prev/next counts, opacity falloff, tint) and **live 1x preview panel** playing the active tag while editing.
18. **Hot-reload validation**: headless integration test — boot ECS + scene with a `.bsprite`-referencing sprite, save through the editor document path, assert the running scene view picks up new pixels and dimension changes (extend `test/support/sequence-harness.ts`).
    18b. **`.aseprite` importer** (moved here from Phase 4 — step 19 depends on it, and phases must stay serially completable): cels/layers/tags/durations via the existing JS read-parser approach, producing a `.bsprite` document.
19. **Actor migration (proving consumer)**: the step-18b importer converts the six strips' `.aseprite` sources into `player.bsprite` with tags for all nine player clips (`fps:0` freeze-frames — `jump`, `wallslide`, `dash`, `walljump` — become 1-frame tags); **all eight prefabs** referencing the strips (`player`, `companion`, `critter`, `enemy`, `guard`, `pickup-tutor`, `quest-giver`, `quickfoot`) rewrite clips → tags; hand-authored content rects dropped in favor of bake-derived; `sprite.finished` consumers (`player-animation-system.ts`) verified; strip PNGs + `.aseprite` sources deleted. **Bow attachment**: author a per-frame grip point on the player; bow-holding system reads a new `spriteAttachment()` query (flipX-mirrored, `undefined` when absent); optional nock point on the bow for arrow spawn.

### Phase 2 — Drawing suite

20. Sized round/square brushes, pixel-perfect stroke, line/rect/ellipse, contiguous + global fill with tolerance, Alt-hold eyedropper, H/V symmetry, dithered gradients + dither brush, custom brushes captured from selection + scatter/foliage brushes, stroke stabilization, pressure dynamics (`PointerEvent.pressure` → size/opacity curves), alpha-lock ink.
21. **Palette panel**: working palette (reorder, save/load `.gpl`/Lospec import), replace-color A→B; **shading ink** walks palette order (no separate ramp-generation tool — not triaged in).

### Phase 3 — Selection suite

22. Rect marquee, lasso, magic wand (tolerance, contiguous/global), flip/rotate-90, move/cut/copy/paste as floating selection with defined commit semantics (tool switch, frame/layer switch, save all commit), marching-ants overlay, wrap-around shift, RotSprite arbitrary rotation, free transform with pivot + skew.

### Phase 4 — Importers & tileset polish

23. **Importers** (editor-side, one-time, read-only, all producing `.bsprite` documents): PNG (exists as load path), **`.pdn`** (TS NRBF reader, pypdn as reference, validated against the repo's three real files: `tree.pdn`, `birch.pdn`, `kbd.9slice.pdn`), **ORA** (zip + `stack.xml`). (`.aseprite` already landed as step 18b.) Import policy (decided): a file using anything `.bsprite` cannot represent is **refused** with a message naming the offending layers/features — no silent flattening, no partial import; with the legacy blend modes in the schema this should be rare. Hidden source layers import as `visibility: false`. Migrate `kbd.9slice.pdn` → `kbd.bsprite` with manifest insets; delete the iTXt reader path and hardcoded fallbacks.
24. **Tileset mode**: paint-through preserved on the cels document (paint targets active layer's current cel; inverse-mapping reads composite — survives by construction); `SAMPLE_CELLS` modestly extended; width-multiple-of-`SHEET_COLUMNS` validated for loaded documents, not only the new-dialog.

### Ordering constraints

- A1 (schema) before A3/A4/A6 and B-phase-1 serialization.
- B10–B12 before any Phase 2/3 tool.
- A4/A5 before step 18; step 18b (`.aseprite` importer) before step 19.
- Steps 8, 9, 13 are independent and can land any time (8 and 9 are day-one quality-of-life fixes — do them first).

### Roadmap upkeep

Already done in the planning session (2026-07-20): the design-session bullet was removed from `docs/roadmap.md` and replaced with follow-up bullets (universal tear-out windows, multi-file canvas spike, real-scene tileset backdrop, top-toolbar adoption audit, AssetManager reconciliation), and the dirty-state bullet was extended with the HMR-reload guard requirement. Implementation does not need to touch the roadmap.

## Research findings that drove this

- **Built-in editors plateau at placeholder quality and are abandoned at the first missing animation feature** (onion skinning most-cited) or first data loss; the exception pattern is editors owning an engine-native representation external tools can't express (GB Studio). `.bsprite`'s metadata-first design (attachments, 9-slice, tilesets, tags in one document) is exactly that exception; the Aseprite issue tracker (gizmos #3511, tagged points #1357) is the unfilled demand.
- **Pixelorama independently converged on zip(PNGs)+JSON** and documented why (PR #952); ORA proves the merged-image-in-container pattern; Sketch proves schema-published-openly.
- **Canvas2d natively implements the standard blend set**, and the pdn/aseprite legacy modes (Subtract, Divide, Reflect, Glow, Negation) are one-line per-channel formulas on the CPU compositing path; Piskel ships zero modes and survives — blend modes are an editor-side concern the engine never needs to see (hence bake-at-save).
- **Unity's Aseprite importer lessons**: key layers by stable IDs not names; decide hidden-layer and unsupported-mode semantics explicitly.
- **`.pdn` is NRBF (publicly specced by Microsoft) + gzip**, proven parseable by pypdn — not a dead end; a read-only importer is bounded work validated against exactly three files.
- **Data-loss = trust-death** (GameMaker "months of work" reports) → atomic writes are non-negotiable v1; zip mid-write corruption loses the whole archive (central directory at EOF).
- **Codebase**: renderer invalidation primitives exist (`invalidateImage`/`invalidateTileArray`) but `AssetManager` has no eviction; render systems re-poll every frame so eviction self-heals most consumers; the iTXt 9-slice channel has readers but no writer anywhere; the editor's canvas panels are already tiny ECS games, which the tileset paint-through loop builds on.
- **Sizing critique**: full scope ≈ 35–50 focused FTE-weeks by solo-human math — irrelevant as calendar here (agentic implementation), but the _ordering_ findings stand: foundations-before-tools, undo-split-before-cels, layers-panel-as-timeline-axis; foundations + Phase 1 deliver ~80% of the stated value.

## Risks & open questions

- **Canvas2d bake determinism across Electron upgrades**: CPU path removes GPU variance, but a Chromium PNG-encoder change could re-encode identical pixels differently; dirty-frame byte-copying contains the churn to actually-edited frames. Accepted.
- **`.pdn` NRBF reader**: bounded by validating against the three repo files; if a future paint.NET version breaks it, the importer has already served its purpose. Accepted.
- **Cels undo/selection state machine** is the highest-complexity editor surface (Aseprite spent years on floating-selection bugs); the commit-semantics rules in steps 12/22 are the guardrail, and Phase 3 lands after the document model has stabilized.
- **Scope**: this is the largest plan in the repo. Phase boundaries are chosen so a pause after any phase leaves a coherent tool (research: half-done ships are punished hardest).
- No open questions — all decisions above were made explicitly in the planning session.

## Implementation status & handoff (added mid-implementation, 2026-07-22)

**The entire plan (Workstream A, B foundations, Phases 1–4) is implemented on the
private branch `feature/2026-07-20-sprite-editor`.** `bun check` is green (604
tests, 0 fail) and `bun run build` (production) succeeds. This section exists so a
fresh session can continue without re-deriving; the prior session ran out of
context.

### Handoff protocol (important)

- The branch is **private, unpushed, unmerged** — do NOT push/PR/merge it.
- It has NOT been collapsed to main. The collapse (delete this plan file →
  `git switch main` → `git merge --squash` → `git reset`, leaving uncommitted
  changes on main) happens ONLY after the user gives an explicit all-clear
  **after playtesting**. Until then, keep working on the branch as throwaway
  checkpoints.
- An unrelated `docs/plans/2026-07-21-feature-weather-system.md` lives on this
  branch (committed) and must be preserved verbatim — it rides into main with the
  collapse; only THIS plan file is `git rm`'d at all-clear.
- The `.aseprite` sources were deleted (user-authorized); `player.bsprite` (7
  limb layers) and `kbd.bsprite` are the layered sources of truth now. Do NOT
  regenerate those `.bsprite` files casually.

### Crash fixes already applied this session (all validated in the real app)

- Rapier/Vite dev wasm heap desync (`vite.config` `optimizeDeps.exclude`).
- Eraser lag (per-stamp full recomposite) + brush/eraser gesture dead-state
  (introduced a `GestureController` discriminated-union owner) + Space-release
  cursor refresh.
- Outline shader missing on `.bsprite` (shared `resolveSpriteDraw` helper).
- Editor crashed on ANY asset open — `tool-options.tsx` passed an unstable
  `getSnapshot` to `useSyncExternalStore` → infinite render loop.

### Open decisions for the user's feedback session (nothing blocks; all changeable)

- **Importers not wired to a UI action.** `.aseprite`/`.pdn`/`.ora` importers
  exist as modules but there is NO in-editor path to import one → `.bsprite`
  document. Only `.png`/`.bsprite` open through a view. Wiring an import action
  (drop/open a source file → produce a `.bsprite`) is the main functional gap
  vs the plan's step-23 intent. **Decision needed: wire it, or leave importers
  as programmatic/migration tools?**
- **Actor art:** run/run-backwards render in the canonical limb z-order
  (`LARM,LLEG,TORSO,HEAD,RLEG,RARM`), ~3–4% pixel diff from the old shipped
  strips — needs a visual OK. `kbd.bsprite` was generated from the shipping
  16×16 PNG (not the 32×32 `.pdn`, which has non-runtime marker layers); a
  layered re-author from the `.pdn` is a possible follow-up.
- **Floating toolbar → tools-only?** Undo/redo (and color picker?) still live in
  the floating toolbar; the plan implied moving them to the docked top toolbar.
  Not done — pending user call.

### UX defaults chosen during implementation (review + adjust in feedback session)

All conventional pixel-editor picks, easy to change:

- **Tools/keys:** SPACE = hold-pan; Alt = hold-eyedropper (suppressed while a
  selection/transform tool is active, where Alt = subtract / skew); brush size 1
  / round; symmetry axis = image center; fill contiguous + tolerance 0; shape
  fill off; custom-brush shortcut `t`, dither `d`, gradient `n`, scatter `k`,
  attachment `A`, free-transform `Ctrl/Cmd+T`; `Shift+H`/`Shift+V` flip;
  `Shift+arrows` wrap-shift; arrow keys = cel navigation.
- **Brush dynamics:** stabilizer 0–100 (0 off); linear pressure curves; dither
  = Bayer 4×4 only (pattern selection deferred); gradient runs active-color →
  transparent (no secondary color slot exists — a real 2-color gradient wants
  one); "foliage" ships as a plain scatter brush.
- **Inks:** shading ink is forward-only (no reverse-shift gesture); off-palette /
  non-opaque pixels unchanged; replace-color operates on the active cel only.
- **Palette:** floating bottom-left, localStorage-persisted, workspace-wide
  singleton (not per-doc, not in the manifest — palette-in-manifest is deferred);
  no OS save dialog, so `.gpl`/`.hex` export writes into the project assets dir.
- **Selection:** internal clipboard only (no system clipboard); paste at the
  copied origin; Enter commits / Escape cancels; selection + its transforms are
  texture-view-only (not wired to the tileset paint-through view); selection
  transforms fold into the single float-commit undo entry (not individually
  undoable); no-selection flip/rotate falls back to whole-image; wrap-shift is
  whole active-cel only.
- **Free transform:** numeric panel (scale/rotate/skew/pivot) is solid; the
  on-canvas handle hit-testing/drag geometry is coarse and needs interactive
  tuning. RotSprite = Scale2x×8 → rotate → majority downscale (cardinals exact).
- **Timeline:** bottom strip; cel-drag = move, Alt = copy; new tag spans all
  frames + loops; new-frame duration 100ms; deleting the last frame refused.
- **Onion:** off by default; prev = red, next = blue; prev1/next1. **Preview:**
  top-right, 1×. **Attachment tool:** placing is inert until a point name is
  selected/added (want click-to-create?); pixel-center snapping; right-click
  clears the frame's point.
- **Save:** new sprites are always `.bsprite`; a legacy `.png` opened is silently
  converted to `.bsprite` on save; load/save errors surface minimally; a loaded
  tileset with width not a multiple of `SHEET_COLUMNS` shows a non-blocking toast.

### Known limitations / follow-ups (not blocking)

- All editor UI/interaction is built to spec but only its **logic** is headlessly
  tested — the visual/interactive behavior (drawing feel, overlays, panels,
  transforms, marching ants, onion, preview, bow placement) needs a real
  `bun run dev` playtest. That is the outstanding validation.
- The optional end-of-run **API-shape tightening pass** (skill step 5) was
  skipped to prioritize a runnable build; available as a follow-up.
- `docs/bsprite-format.md` still references the now-deleted `png-metadata.ts` as
  historical rationale (harmless).
