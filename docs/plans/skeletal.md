# Skeletal Animation (Cutout) — Architectural Plan

Status: **planned** (no implementation yet). Builds on `animation.md` (frame
clips + FSM graph) and the generic FSM (`state-machine.md`). Owns the
"attachment points / skeletal future" that `animation.md` §7/§10 parked.

## 1. Goal

Cutout (paper-doll) skeletal animation: a character is a hierarchy of **bones**,
each bone drawing one **affine-transformed quad** of art. Enables:

- **Equipment customization** — swap the sprite bound to a slot (helmet, sword,
  bow) and it animates correctly with no per-equipment authoring. This, not the
  bow, is the reason skeletal is justified: per-frame animation would require
  posing every armor piece in every frame of every clip.
- **Dynamically-angled content** — the bow. One bone aims at a target; the rest
  of the body stays keyframe-animated. No combinatorial pose art.

Everything is **pixel-perfect**: see §3 (the C rendering model).

## 2. Scope cut — cutout, NOT mesh-deform

- **In:** rigid sprite-per-bone. Each bone is an affine quad (rotate/scale/
  translate). This is all equipment swapping and the bow need.
- **Out (parked):** weighted-vertex mesh deformation (Spine-style smooth
  bending), 2-bone IK, blend trees, cross-fade. Mesh deform buys nothing for
  equipment and is a different, much harder beast. Single-bone procedural aim is
  in; full IK is a later upgrade. Park these the way `animation.md` §7 parks
  blending.

## 3. Rendering — the "C" model (pixel-perfect rotation + smooth motion)

Decision validated against a standalone demo (three pipelines compared). The
tension: a single shared art-pixel lattice gives clean chunky rotation but forces
in-world motion to step one art-pixel at a time; rendering rotation at output
resolution keeps motion smooth but makes rotated pixels uneven/shimmery. Neither
is acceptable. **C resolves both:**

- **Bake per object at art resolution.** Each rigged entity renders its bone
  quads into its own **art-resolution** render target (sized to the skeleton's
  bounds + margin). Rotation rasterizes on the art grid → clean, uniform chunky
  pixels.
- **Place at sub-pixel position, output resolution.** That art-res buffer is then
  drawn into the world at the entity's **fractional** position and the existing
  zoom. Motion stays sub-pixel smooth — the existing output-res pipeline and
  screen-pixel-snapped camera (`camera-render-pipeline`) are unchanged.

Consequence (accepted): there is **one shared pixel _scale_, not one shared
literal lattice**. Each dynamic object sits on its own sub-pixel phase, so a
standing character's pixels don't lock to the world tile grid. Invisible for
moving/rotating content; a subtle phase difference when static. The user
confirmed this trade over both alternatives (output-res shimmer; art-res
stepping).

Per-effect note: wanting wind displacement / arrow angle to move in whole
art-pixel increments is a **per-system rounding choice** (round the value to the
art scale in that system), independent of this render path.

### Renderer extension required

The renderer composites layers into output-res scratch FBOs then blits
(`renderer-2d.ts`). `drawImage` takes an `HTMLImageElement|Canvas` (resolved via
`getTexture`); it cannot draw an existing `WebGLTexture` / `RenderTarget` as a
world quad. C needs exactly that: render a skeleton into an art-res
`RenderTarget` (the `RenderTarget`/`createRenderTarget`/`sceneTarget` machinery
already exists), then composite that RT as a sub-pixel-placed quad into the
entity's layer with NEAREST. New small renderer capability:
`drawTarget(layer, renderTarget, opts)` (or equivalent). This is the only live
renderer change; everything else is additive.

## 4. Model (data — no entity hierarchy)

The skeleton is a hierarchy of **bones as data inside one component**, NOT a tree
of ECS entities. This keeps "no entity hierarchy, ever" intact: bones relate by
index/parent-index within the component; equipment references attachments by
id/asset; behavior lives in systems.

```
type Bone = {
  name: string
  parent: number            // index into bones, -1 for root
  rest: { x, y, rotation, scaleX, scaleY }   // local transform at rest
}

type Slot = {
  name: string
  bone: number              // index of the bone this slot draws on
  drawOrder: number
  attachment: string | null // id of the attachment currently bound
}

type Attachment = {         // a drawable region of art bound into a slot
  id: string
  image: string             // atlas/sprite url
  rect?: { x, y, w, h }
  offset: { x, y, rotation, scaleX, scaleY }  // local to the slot's bone
}

class SkeletonComponent {   // data
  defId: string             // authored skeleton (bones + slots + attachments)
  pose: BoneTransform[]     // runtime local transforms (derived; not serialized)
  // equipment overrides slot.attachment by id (see §6)
}
```

Authored skeleton + clips are **data files** (a `.json` asset, like prefabs),
not TS constructs (`prefabs-as-data-files`). Runtime pose is **derived**, never
serialized (`serialization-derive-not-store`).

## 5. Systems & flow

```
[StateMachineSystem]  -> current state (data-condition FSM; params: speed, grounded, trigger:*)
        |                  state -> clip mapping (animation graph def, reuses animation.md)
        v
[SkeletonAnimationSystem] -> advance clip time; write SkeletonComponent.pose (bone local transforms)
        v
[AimSystem]           -> override designated aim bone(s) toward a target (the bow); layered on the pose
        v
[SkeletonRenderSystem] -> walk bones -> world transforms; bake slot quads into the entity's
                          art-res RT; composite RT into the layer at sub-pixel position (the C model)
```

- Animation **graph = the generic FSM**, identical to `animation.md` — states
  carry a clip, transitions are data conditions over params set by gameplay
  systems. Skeletal clips keyframe **bone transforms** instead of swapping frame
  rects.
- The **aim bone** is the bow solution: one bone's rotation is set to
  `angleToTarget` after the keyframed pose is written (reuses the math already in
  `game/systems/bow.ts`). The bow is an attachment in the hand slot.

## 6. Equipment

- `EquipmentComponent` maps slot name → attachment id (by id, resolved by a
  system — `no-entity-hierarchy`). Swapping an id reskins the slot; the bone
  animation is unchanged. This is the §1 payoff and is partially demoable from
  chunk 1 (static rig + attachment swap) before any animation exists.

## 7. Layering

- **Engine:** skeleton data model, `SkeletonComponent`, the three systems above,
  art-res-bake + sub-pixel composite render path, the `drawTarget` renderer
  capability, skeleton/clip asset parsing. Graph reuses `engine/fsm/*`.
- **Game:** concrete rigs, clips, and equipment defs as data; rigged prefabs;
  the gameplay systems that set animator params and the aim target.
- **Editor:** all authoring + preview (bone placement, slot binding, keyframe
  timeline, attachment binding, onion skin) — `sprite-editor.md` scope.

## 8. Migration path (graspable chunks)

Ordered so each chunk is independently playable and the expensive editor work
comes **last** — chunks 1–4 run on hand-authored JSON.

1. **Static cutout rig + render path.** Skeleton as data (bones/slots/
   attachments), no animation. Composite a posed-at-rest character from part
   sprites via bone transforms, through the C render path (art-res bake →
   sub-pixel composite). Adds the `drawTarget` renderer capability. _De-risks the
   render math AND demos equipment swapping on day one._
2. **Keyframed bone animation.** `SkeletonAnimationClip` (per-bone keyframes +
   interpolation) + `SkeletonAnimationSystem` writing the pose. Hand-author one
   walk clip as JSON. Drive state→clip via the FSM graph from `animation.md`.
3. **Procedural aim bone.** Override the hand bone toward a target on top of the
   keyframed pose. The bow + arrow fall out; melee = a swing clip on the same arm.
4. **Equipment component.** Slot→attachment swapping by id (the customization
   payoff; partially visible from chunk 1).
5. **Editor authoring.** Bone placement, slot binding, keyframe timeline
   (`editor/timeline/` exists), attachment binding, pose preview, onion skin.
   The big effort, deferrable — a playable rigged character exists long before
   the tooling is nice.

## 9. Open sub-decisions / handoffs

- **Depends on:** generic FSM (`state-machine.md`); the `animation.md` graph
  model (skeletal clips reuse the same state→clip FSM).
- **Skeleton/clip asset format** — shares the prefab/asset-JSON direction; finalize
  alongside the spritesheet-metadata format in `animation.md`.
- **Aim bone authoring** — which bone(s) are aim-driven and the target source
  (cursor world pos) — game-layer config on the rig.
- **`drawTarget` signature + RT pooling/sizing** — finalize in chunk 1.
- **Mesh deform / IK / blending** — parked (§2).

## 10. Primary files

- New: `engine/skeleton/*` (model, clip), `engine/components/skeleton.ts`,
  `engine/components/equipment.ts`, `engine/systems/skeleton-animation.ts`,
  `engine/systems/aim.ts`, `engine/systems/skeleton-render.ts`, skeleton/clip
  asset parsing.
- Changed: `engine/renderer-2d.ts` (`drawTarget` capability), rigged prefabs
  (game), animation graph defs (reuse `engine/fsm/*`), gameplay systems (set
  params + aim target). `game/{components,systems,entities}/bow.ts` migrate to
  the aim bone.
