# Renderer facts (verified) — for W2 / W5 / W6

## Corner quad

`Renderer2D.pushQuadShape(id, texture, format: "quad"|"text"|"outline", px[4], py[4], uv[8], color)`
at `renderer-2d.ts:927` IS the arbitrary-4-corner textured quad path. Private.
Corner order **TL, TR, BR, BL** (from `imageQuad`, `:955-994`: `lx=[-hw,hw,hw,-hw]`,
`ly=[-hh,-hh,hh,hh]`); `uv = [u0,v0, u1,v0, u1,v1, u0,v1]`.
**World y is down** (`WORLD_VS` negates clip.y, `programs.ts:13`) → indices **0 and 1
are the TOP corners** (the shear targets). `flipX` swaps u0/u1 only, never positions.
Shear (top edge translated, edges parallel) is affine → the `[0,1,2,0,2,3]` triangle
split interpolates UVs consistently, no seam. A trapezoid (top edge _scaled_) WOULD
seam — don't.

## Per-draw blend threading sites (all of them)

1. `blend.ts:9` `applyLayerBlend(gl)` → add mode param / `applyQuadBlend(gl, mode)`.
   Textures are **straight (non-premultiplied) alpha**
   (`UNPACK_PREMULTIPLY_ALPHA_WEBGL=false`, `renderer-2d.ts:572-573`).
   Normal today: `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`.
   Additive for that straight-alpha scratch: `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)`.
2. `type Batch` `renderer-2d.ts:429-435` → add `blend`.
3. `recordQuad` `:901` sig + merge condition `:908-913` → add `last.blend === blend` to key.
4. `pushQuadShape` `:927` sig + `:941` call.
5. `drawTile` **duplicated inline merge** `:1097-1114` → same key addition. (2nd merge site!)
6. `runCommand` `:1842` `applyLayerBlend(gl)` → `applyQuadBlend(gl, cmd.blend)`. Must sit
   after the raw/pushClip/popClip/holdRing early-returns `:1812-1841`, and the `static`
   branch `:1843-1855` needs a decision (static batches have no per-quad blend → force normal).
7. Opts types: `DrawImageOpts :48`, `DrawTileOpts :63`, `DrawRectOpts :77`, `DrawTextOpts :102`.
8. Callers of pushQuadShape default to `"normal"`: `drawImage :996`, `drawImageOutline :1020`,
   `fillRect :1117`, `drawRect :1142`, `strokeSegment :1191`, `drawLine :1222`,
   `pushGlyphQuad :1335`, `drawText :1272`, `drawGlyph :1381`, `drawTile :1069`,
   `drawStaticBatch :1242`.
9. `applyLayerBlend` also called at `:1940`, `:1979` in `paintHoldRing` — keep normal.
   Blend in the merge key splits batches but PRESERVES submission order → correct occlusion.

## Per-layer blend is dead code (safe but NOT in scope to remove)

`setLayerBlend` (`:873`), `LayerState.blend/opacity` (`:468-469`), consumed only at
`:1506-1507`. Zero callers in src/. NB `src/editor/sprite/layer-commands.ts:85` has an
unrelated same-named method — do not touch.

## Solid-color quads already work, and batch into ONE drawArrays

`drawRect`/`fillRect`/`drawLine` use a 1x1 `whiteTex` (`:592-614`); `QUAD_FS` is
`texture(u_tex,v_uv) * v_color` (`programs.ts:26`) so white x vertex color = pure color.
All whiteTex quads share one merge key → thousands of contiguous solid particles = 1 draw
call. **A particle system needs no atlas and no new GPU resources.**

## Render layers — the scratch-target cost trap

`resolveRenderLayer(ecs, layer, order=0)` (`render-layers.ts:28`) →
`RENDER_LAYER_BASE(1000) + index*RENDER_ORDER_STRIDE(1000) + clamp(order,0,999)`.
Layers: `["background","entities","foreground","terrain","overlay"]`
(`render-layers.ts:10-16`; note `terrain` sorts ABOVE `foreground`). Unknown name silently
sorts above everything (`findIndex` → `layers.length`).
**Every distinct numeric id owns a full-viewport RenderTarget**: per used id per frame =
1 full-viewport clear + 1 full-screen blit + texW*texH*4 VRAM. So `order:0` and `order:1`
in one layer are two separate full-screen FBOs. → **particles must use ONE (layer, order)**
and rely on within-layer command order. Idle layers dispose after `MAX_IDLE=2` frames
(`:472`, `endFrame :2086-2097`) so churning orders churns FBO allocation.
`resolveRenderLayer` does a full `ecs.query(RenderLayersComponent)` per call — **hoist it
out of per-particle loops**.

## Sprite draw path (shear hook)

`SpriteRenderSystem.render({renderer, ecs, assetManager})` `sprite-render-system.ts:8`
→ `ecs.query(SpriteComponent, TransformComponent)` `:9` (currently discards entity id as
`[, sprite, transform]` — change to `[id, ...]` for per-instance hashing)
→ `resolveSpriteDraw(sprite, assetManager)` `resolve-sprite-draw.ts:33` → `{image, source}`
(returns null while loading; caller skips `:14`)
→ `resolveRenderLayer(ecs, sprite.renderLayer, sprite.order)` `:18`
→ `renderer.drawImage(layer, image, opts)` `:23` → `imageQuad` `:955` → `rotateCorners` `:279`
→ `pushQuadShape` → `writeQuad :188` → `recordQuad :901`.
Draw opts built `:23-35`: position = sprite CENTER (`transform.position`), size
`source.width*transform.scale.x` x `source.height*transform.scale.y`,
`rotation: transform.rotation.radians`, `flipX: sprite.flipX`, `alpha: sprite.opacity.value`.
**Recommended hook:** add `shear` (world units) to `DrawImageOpts` and apply in `imageQuad`
AFTER `rotateCorners`, to indices 0,1 only: `px[0]! += shear; px[1]! += shear;`.
Sprite top world-y = `position.y - drawnHeight/2` (cf. `entity-top.ts:45-49`).
Sibling call sites building the same opts: `interact-outline-render-system.ts:42-57`
(`drawImageOutline`), `bow-render-system.ts:20`. `entity-top.ts:30` uses the UNSHEARED rect,
so sway won't move health bars/barks (desired).

## Camera in a render system

`RenderContext` (`system.ts:27-35`) = `{renderer, time, ecs, input, assetManager, uiScale,
camera: Camera2D | null}`. `camera.visibleBounds()` (`camera-2d.ts:71`) allocates 2 Vector2
per call — cache per frame.
**Gotcha 1:** `camera.viewportWidth/Height` are ONE FRAME STALE (assigned in
`renderSceneToTexture`, `camera-2d-render.ts:40-41`, which runs AFTER `ecs.render`), and are
0 on frame 1. Prefer `halfW = renderer.width/2/camera.zoom`, `halfH = renderer.height/2/camera.zoom`.
**Gotcha 2:** `camera.shake` is excluded from `visibleBounds()` but IS folded into the render
target origin (`camera-2d-render.ts:47-49`) → pad the spawn band by max shake.
`camera === null` is normal (no active Camera2DComponent) — guard, it isn't defensive noise.

## Texel quantization

No shared helper exists. The one world-space texel snap is inlined at
`camera-2d-render.ts:46-50`: `Math.round(v * zoom) / zoom`. Copy that formula for the shear.

## GPU resources

`RendererResourceCache<V,R=Renderer2D>(create, destroy)` `renderer-resource-cache.ts:32`,
`.get(renderer)` `:44` — MANDATORY for anything holding GL objects (one world, N renderers
= N editor views). Refs: `tilemap-render-system.ts:42-51`, `decorations.ts:41-46`.
`renderer-registry.ts` is NOT a render-system registry (it fans out texture invalidation).
Render systems register via `ecs.addRenderSystem` (`ecs.ts:281`), run in insertion order
(`ecs.ts:325-329`), untimed / no profiler decorator needed.
Raw-GL escape hatch: `withRawLayer(id, fn)` `:1254`; `RawLayerContext` `:120-132` gives
`{originX, originY, spanX, spanY, texW, texH}` = exact world rect with shake+snap applied.
`runCommand` re-binds FBO+viewport after the callback but does NOT restore program/blend/VAO.
