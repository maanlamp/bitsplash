# Animation — Architectural Plan

Status: **planned** (no implementation yet). README summary under "Animation".
Built on the generic FSM (`state-machine.md`); authoring tools handed to
`sprite-editor.md` (TBD).

## 1. Goal

Frame-based sprite animation driven by the generic State Machine. v1 = clips +
FSM-driven graph + frame events. Blending and skeletal are explicitly out of v1
(notes below).

## 2. Where we are today

- `engine/components/sprite.ts` — `SpriteComponent` is a single static image
  (`url`, `width`, `height`, `opacity`, `flipX`). No frames, no animation.
- `engine/systems/sprite-render.ts` — draws the whole image.
- `engine/renderer-2d.ts` — already samples sub-rects for **tiles**
  (`DrawTileOpts`), so source-rect sampling exists; sprites just don't use it yet.
- Generic FSM (`state-machine.md`) — the backbone for the animation graph (data
  conditions).
- Greenfield otherwise.

## 3. Locked decisions

1. **Spritesheet + metadata** frames (matches the atlas/tile direction).
2. **Clips only** in v1 (hard-cut transitions). No blending.
3. **Animation graph = the generic FSM** (data-condition evaluator), states→clips.
4. **Attachment points deferred** to the skeletal workflow (sprite editor).
5. **Blending parked** as a concept (§7).

## 4. Model

```
type AnimationFrame = { rect: { x, y, w, h }; duration: number; event?: string }
type AnimationClip  = { name: string; frames: AnimationFrame[]; loop: boolean }

class AnimatorComponent {        // data
  graphId: string                // animation state machine (a StateMachineDef)
  // current clip is derived from the FSM's current state -> clip mapping
  frame: number                  // index into the current clip
  elapsed: number                // seconds in current frame
  speed: number
  playing: boolean
}
```

- The spritesheet PNG carries frame definitions in metadata (iTXt), same channel
  as tile/atlas metadata. A clip references frames by rect (or index into the
  sheet's frame list).
- `SpriteComponent` gains an optional `sourceRect` the animator writes each tick;
  `SpriteRenderSystem` draws `sourceRect` when present (else the full image).
  Static sprites are unaffected. **One render component**; animation just drives
  its frame (footgun-free).

## 5. Systems & flow

```
[StateMachineSystem]  -> current state (data-condition FSM, params: speed, grounded, trigger:*)
        |                    state -> clip mapping (in the graph def)
        v
[AnimationSystem]     -> advance frame timing for the active clip;
                         write SpriteComponent.sourceRect; emit frame events
        v
[SpriteRenderSystem]  -> draws the source rect
```

- **Graph = FSM:** each state in the `StateMachineDef` carries a `clip` (and later,
  a blend-tree). Transitions use **data conditions** over `params`
  (`AnimatorComponent`/blackboard). On `StateEnter`, the active clip switches +
  frame/elapsed reset. Hard cut (no cross-fade) in v1.
- **Params** are set by gameplay systems (e.g. movement writes `speed`,
  `grounded`; an attack sets `trigger:attack`). Player movement state can drive
  the animator via the same params it already tracks.
- **Frame events:** when a frame with an `event` becomes active, emit it on the
  bus (entity id + event name). Gameplay systems react (spawn hitbox, footstep
  sfx via the existing audio event path, fire). Distinct from FSM state
  enter/exit events.

## 6. Authoring (handoff to sprite editor)

- Define frames on a spritesheet (slice grid / mark rects) + per-frame durations.
- Timeline (playback, looping, **onion skin**), clip list, frame-event tagging.
- Animation **graph** editing (states, clip per state, data-condition transitions,
  params) — this is the data-authored `StateMachineDef`.
- Preview against live params.
- All of this is `sprite-editor.md` scope; the runtime here provides the playable
  model the editor authors.

## 7. Blending — conceptual, NOT built (parked)

Recorded so the concept isn't lost; intentionally deferred:

- Pixel-art frame animation can't meaningfully interpolate in-between frames, so
  for frame clips "blending" realistically means:
  - **Cross-fade** on transitions (alpha-blend outgoing/incoming clip briefly).
  - **Blend trees that _select_ a clip by param** (e.g. aim angle → which attack
    clip; speed → walk vs run) — selection, not interpolation.
- **True interpolation** (interpolating transforms) only makes sense in a future
  **skeletal** track (bones/points → procedurally posed pixels), which also owns
  attachment points. That's where real "blending" lives.
- May also find niche use in some **2D effects** (fading/cross-dissolving
  decorative animations). Highly conceptual for now — revisit when skeletal is
  specced.

## 8. Layering

- **Engine:** `AnimationClip` type, `AnimatorComponent`, `AnimationSystem`,
  spritesheet frame-metadata parsing, `SpriteComponent.sourceRect` + render
  support, frame-event emission. The graph reuses the generic FSM
  (data-condition evaluator).
- **Game:** concrete clips + animation graphs (as data), animator setup on
  player/enemy prefabs, the gameplay systems that set animator params.
- **Editor:** clip/timeline/onion-skin + graph authoring + preview
  (`sprite-editor.md`).

## 9. Migration path

1. Spritesheet frame metadata + `SpriteComponent.sourceRect` + renderer
   source-rect for sprites + `AnimationClip`/`AnimatorComponent` +
   `AnimationSystem` playing a single clip (no graph yet).
2. Frame events on the bus.
3. Animation graph = data-condition FSM (`state-machine.md` step 2); state→clip;
   params from gameplay (wire player movement → params).
4. Authoring in the sprite editor (timeline, onion skin, graph) — sprite-editor
   task.
5. (Future) blending track; (future) skeletal + attachment points.

## 10. Open sub-decisions / handoffs

- **Depends on:** generic FSM (`state-machine.md`); spritesheet metadata format
  (shares the PNG-iTXt channel with tiles/atlas — finalize jointly).
- **Sprite editor** owns all authoring + preview + onion skin + the skeletal /
  attachment-points future work.
- **Blending & skeletal** parked (§7).
- **Frame reference**: rect vs index-into-sheet-frame-list — lean explicit rects
  in the clip, sheet metadata just names/slices frames.

## 11. Primary files

- New: `engine/animation/clip.ts`, `engine/components/animator.ts`,
  `engine/systems/animation.ts`, spritesheet metadata parsing.
- Changed: `engine/components/sprite.ts` (`sourceRect`),
  `engine/systems/sprite-render.ts` (draw source rect), animation graph defs reuse
  `engine/fsm/*`, player/enemy prefabs (+ animator), movement systems (set params).
