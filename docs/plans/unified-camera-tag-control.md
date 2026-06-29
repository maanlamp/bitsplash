# Unified Camera + Tag Control

## Goal
Replace the fragmented tag and camera control with marker component classes and a per-camera transition-based director that ink, quests, and gameplay code all use through one API.

## Plan

### 1. Marker tag components (replace TagsComponent)

**Files:** `src/engine/components/tag-player.ts`, `src/engine/components/tag-enemy.ts`, etc.

Each tag is its own empty marker class:

```ts
@serializable("Player")
export class PlayerTag extends Component {}

@serializable("Enemy")
export class EnemyTag extends Component {}
```

- Query natively: `world.query(PlayerTag)` returns all player entities.
- No string iteration, no array allocation at query time.
- Prefab JSON uses the component class name (e.g. `"Player"`) to attach the marker — same shape as existing `tags`, but each entry maps to a known component class rather than a freeform string.
- Existing tags (`player`, `enemy`, `quest_target`, `dialogue_trigger`, etc.) each get their own marker class.
- Delete `tags.ts` (no string-array component).

### 2. CameraControllerComponent (new)

**File:** `src/engine/components/camera-controller.ts`

Holds desired camera state on the camera entity:

- `transition: { type: "none" | "follow" | "lookAt" | "move" | "zoom" | "fade", ... }` — current transition (see transition schema below)
- `shakeTrauma: number` — current shake amplitude
- `shakeDecay: number` — shake decay per frame
- `followDeadzone: { x: number; y: number }` — stop-following threshold (default 4)

Default values: no transition, no shake, deadzone 4.
`@serializable("CameraController")`

#### Transition Schema

```ts
type Transition =
  | { type: "none" }
  | {
      type: "follow";
      entityId: string;
      smoothing: { x: number; y: number };
      deadzone: { x: number; y: number } | null;
      lookahead: { x: number; y: number };
    }
  | {
      type: "lookAt";
      entityId: string;
      smoothing: number;
    }
  | {
      type: "move";
      from: { x: number; y: number };
      to: { x: number; y: number };
      duration: number;
    }
  | {
      type: "zoom";
      from: number;
      to: number;
      duration: number;
    }
  | {
      type: "fade";
      from: number;
      to: number;
      duration: number;
    }
```

- `duration: 0` = instant (teleport).
- Transitions are interruptible — new transition cancels current.
- Multiple channels can animate simultaneously (position, zoom, fade).

### 3. CameraControllerSystem (new)

**File:** `src/engine/systems/camera-controller.ts`

Consumes events, writes to CameraControllerComponent, applies transitions:

- `CameraShakeEvent(amount, decay)` → sets `shakeTrauma`, `shakeDecay`
- `CameraFollowEvent(entityId)` → sets transition to `{ type: "follow", entityId, ... }`
- `CameraLookAtEvent(entityId)` → sets transition to `{ type: "lookAt", entityId, ... }`
- `CameraMoveEvent(from, to, duration)` → sets transition to `{ type: "move", from, to, duration }`
- `CameraZoomEvent(from, to, duration)` → sets transition to `{ type: "zoom", from, to, duration }`
- `CameraFadeEvent(from, to, duration)` → sets transition to `{ type: "fade", from, to, duration }`
- `CameraResetEvent()` → clears transition, resets shake

Applies shake math to `Camera2DComponent.position` each frame.

### 4. Camera Events

**File:** `src/engine/events.ts`

- `class CameraShakeEvent { amount: number; decay: number; }`
- `class CameraFollowEvent { entityId: string; smoothing?: { x: number; y: number }; deadzone?: { x: number; y: number } | null; lookahead?: { x: number; y: number }; }`
- `class CameraLookAtEvent { entityId: string; smoothing?: number; }`
- `class CameraMoveEvent { from: { x: number; y: number }; to: { x: number; y: number }; duration: number; }`
- `class CameraZoomEvent { from: number; to: number; duration: number; }`
- `class CameraFadeEvent { from: number; to: number; duration: number; }`
- `class CameraResetEvent {}`

### 5. Ink Bindings — camera externals

**File:** `src/game/ink/bindings.ts`

- `camera_shake(amount?, decay?)` → emits `CameraShakeEvent`
- `camera_follow()` → imports marker component class directly (e.g. `PlayerTag`), queries for entity, emits `CameraFollowEvent`
- `camera_move(from, to, duration?)` → emits `CameraMoveEvent`
- `camera_zoom(from, to, duration?)` → emits `CameraZoomEvent`
- `camera_fade(from, to, duration?)` → emits `CameraFadeEvent`
- `camera_reset()` → emits `CameraResetEvent`

### 6. Refactor existing consumers to emit events

| Consumer | Before | After |
|---|---|---|
| `DialogueSystem.setCameraTargets()` | Mutates `Camera2DFollowComponent` | Emits `CameraFollowEvent` or `CameraLookAtEvent` |
| `DialogueSystem.clearCameraTargets()` | Nulls follow | Emits `CameraResetEvent` |
| `DamageShakeSystem` | Mutates `CameraShakeComponent` | Emits `CameraShakeEvent` |
| `DeathSystem` (player death) | Mutates `CameraShakeComponent` | Emits `CameraShakeEvent` |

### 7. Adapt Camera2DFollowSystem

Read transition from `CameraControllerComponent`. Apply based on `transition.type`:
- `"follow"`: follow entity with smoothing/deadzone/lookahead
- `"lookAt"`: look at entity with smoothing
- `"move"`: interpolate position over duration
- `"zoom"`: interpolate zoom over duration
- `"fade"`: interpolate fade alpha over duration (handled by renderer)

Inline `CameraShakeComponent` into `CameraControllerComponent`.

### 8. Remove obsolete components

- `Camera2DFollowComponent` — superseded by `CameraControllerComponent`
- `CameraShakeComponent` — superseded by `CameraControllerComponent`
- `tags.ts` — replaced by marker tag components

## File map

| File | Action |
|---|---|
| `src/engine/components/tags.ts` | Delete |
| `src/engine/components/tag-player.ts` | New — marker component |
| `src/engine/components/tag-enemy.ts` | New — marker component |
| `src/engine/components/tag-*.ts` | New — one per existing tag |
| `src/engine/components/camera-2d-follow.ts` | Delete |
| `src/engine/components/camera-shake.ts` | Delete |
| `src/engine/components/camera-controller.ts` | New |
| `src/engine/systems/camera-2d-follow.ts` | Modify |
| `src/engine/systems/camera-controller.ts` | New |
| `src/engine/events.ts` | Add 7 event classes |
| `src/game/events.ts` | Update `KillEvent` shape |
| `src/game/systems/death.ts` | Use marker components, emit CameraShakeEvent |
| `src/game/systems/quest.ts` | Use marker components |
| `src/engine/dialogue/dialogue-system.ts` | Emit events |
| `src/game/systems/dialogue-trigger.ts` | Minor |
| `src/game/ink/bindings.ts` | Add camera externals |
| `src/game/prefabs/*.json` | `tags` → marker component class names |
| `docs/plans/` | Add this plan |

## Execution order

1. Create marker tag components (tag-player, tag-enemy, etc.) — no consumers yet
2. Create `CameraControllerComponent` and events — no consumers yet
3. Create `CameraControllerSystem` — no consumers yet
4. Migrate `KillEvent` → use marker components
5. Migrate `DeathSystem` → marker components + emit CameraShakeEvent
6. Migrate `QuestSystem` → marker components
7. Refactor `Camera2DFollowSystem` to read CameraControllerComponent
8. Migrate `DialogueSystem` → emit events
9. Migrate `DamageShakeSystem` / `DeathSystem` → emit events
10. Migrate ink bindings → camera externals
11. Remove obsolete components (`tags.ts`, `camera-2d-follow.ts`, `camera-shake.ts`)
12. Update prefab JSON → marker component class names
13. Run `bun check`
