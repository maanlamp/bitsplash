# Plan: Asset Browser, Constrained Panels & Scene Tree Cleanup

> Status: Draft  
> Depends on: nothing upstream (self-contained editor work)  
> Unlocks: prefab drag-spawn, @image inspector fields, scene system cleanup

---

## Overview

Three tightly related editor improvements:

1. **Asset Browser** — a real file system panel replacing the asset glob hack in the scene tree.
2. **Constrained Layout Groups** — a new concept where a set of panels is fully dockable within a defined region but cannot escape it into the global workspace.
3. **Scene Tree Cleanup** — strip the tree of anything not strictly scene content; surface world-level properties sensibly.

---

## 1. Asset Browser

### 1.1 Dev Server FS Plugin

Today several rough POC plugins exist (live scene save, temp asset upload, etc.). These should be consolidated into a set of meaningfully grouped Vite plugins. The asset browser requires a new plugin: **`vite-plugin-fs`**.

This plugin exposes a small REST API on the dev server. The root is hardcoded to `src/game/assets` for now; decoupling from the game layer is deferred until the project-detachment work.

**Endpoints:**

| Method | Path              | Description                                       |
| ------ | ----------------- | ------------------------------------------------- |
| `GET`  | `/_fs/list?path=` | List directory contents (name, type, size, mtime) |
| `GET`  | `/_fs/read?path=` | Read file as binary (for preview generation)      |
| `POST` | `/_fs/write`      | Write file (`{ path, data: base64 }`)             |
| `POST` | `/_fs/rename`     | Rename/move (`{ from, to }`)                      |
| `POST` | `/_fs/delete`     | Delete file or empty dir (`{ path }`)             |
| `POST` | `/_fs/mkdir`      | Create directory (`{ path }`)                     |

All paths are relative to the configured root. The plugin validates that no path escapes the root (no `../` traversal). Errors return JSON `{ error: string }` with appropriate HTTP status codes.

The existing POC plugins (temp upload, etc.) are removed as part of this work since the asset browser supersedes them.

### 1.2 Client-side FS Service

A thin service layer in `src/editor/fs/` wraps the REST API. Components never call `fetch` directly.

```ts
// src/editor/fs/fs-service.ts
export interface FsEntry {
  name: string;
  path: string;           // relative to root
  type: "file" | "dir";
  size?: number;
  mtime?: number;
}

export const FsService = {
  list(path: string): Promise<FsEntry[]>,
  read(path: string): Promise<ArrayBuffer>,
  write(path: string, data: ArrayBuffer): Promise<void>,
  rename(from: string, to: string): Promise<void>,
  delete(path: string): Promise<void>,
  mkdir(path: string): Promise<void>,
};
```

### 1.3 Asset Browser View

Registered as a workspace view: `asset-browser`. Singleton (one instance, like `canvas`).

**Layout:**

```
[ location bar: back | forward | up | path segments ]
[ file grid: thumbnails or icons, name labels ]
```

Navigation is back/forward/up plus clickable path segment breadcrumbs. State is local to the view (current path, history stack). No router involvement.

**Thumbnails:**

| Asset type                 | Thumbnail                                                      |
| -------------------------- | -------------------------------------------------------------- |
| `*.png`, `*.jpg`, `*.webp` | Rendered `<img>` via `/_fs/read`, capped at the grid cell size |
| `*.tileset.png`            | Same as above                                                  |
| `*.font.zip`               | Generic font icon                                              |
| `*.wav`, `*.mp3`, `*.ogg`  | Generic audio icon                                             |
| `*.json`                   | Generic JSON icon                                              |
| Directory                  | Folder icon                                                    |
| Unknown                    | Generic file icon                                              |

Thumbnails are loaded lazily (only when the cell enters the viewport). Use an `IntersectionObserver`. No caching layer needed at this stage.

**Context menu (right-click on empty space):**

- New Sprite...
- New Tileset...
- New Audio...
- New Folder...

**Context menu (right-click on a file):**

- Open (opens the appropriate editor view)
- Rename
- Delete
- _(separator)_
- _(type-specific items, e.g. "Edit Sprite" for images)_

**Context menu (right-click on a directory):**

- Open
- Rename
- Delete
- _(separator)_
- New Sprite...
- New Tileset...
- New Audio...
- New Folder...

Context menus reuse the existing `AssetContextMenu` pattern and glass surface treatment.

### 1.4 Drag and Drop

Files are draggable from the asset browser. The drag payload is a typed object:

```ts
interface AssetDragPayload {
	type: "asset-drag";
	path: string;
	assetType: AssetType; // "sprite" | "tileset" | "audio" | "font" | "prefab" | "unknown"
}
```

The payload is set on the `DragEvent` as JSON in `dataTransfer` under the key `application/x-bitsplash-asset`.

**Drop registry** (`src/editor/asset-drop-registry.ts`):

```ts
type DropHandler = (payload: AssetDragPayload, context: DropContext) => void;

interface DropContext {
  // what the user dropped onto
  target: "scene-view" | "inspector-field";
  // for inspector-field drops: which entity + component + field
  field?: { entityId: EntityId; componentType: ComponentConstructor; fieldKey: string };
}

export const AssetDropRegistry = {
  register(assetType: AssetType, targets: DropContext["target"][], handler: DropHandler): void,
  resolve(payload: AssetDragPayload, context: DropContext): DropHandler | null,
};
```

Handlers are registered by editor-layer code. Examples:

- `sprite` dropped on `inspector-field` where the field is a `@image` → updates the field value.
- `prefab` dropped on `scene-view` → spawns an entity (deferred; note the hook, don't couple to prefab internals yet).

The registry lives in the editor. The engine has no involvement.

### 1.5 Inspector @image Fields

When the inspector renders a component field decorated with `@image`, it renders a compact field group:

- A **clickable image preview** that doubles as the file picker trigger. If a path is set, it renders the image; if not, it renders a placeholder with a "Choose image..." label. Clicking either opens a file picker scoped to the asset browser root.
- The resolved path as text beneath the preview.
- Width × height of the loaded image, shown as a small caption.

There is no separate "Choose file..." button. The preview is the button.

When a drag interaction is detected anywhere over the field group (`dragenter`), the preview area switches to a dropzone state (highlighted border, "Drop image here" overlay). On `drop`, it validates the payload type is `sprite` or `tileset`, then calls the drop registry handler which updates the field.

This is self-contained to the inspector field renderer. No changes to the engine component decorators are needed beyond adding `@image` as a recognised decorator type.

---

## 2. Constrained Layout Groups

### 2.1 The Problem

The global workspace is a recursive split tree with full drag-to-dock between any region. Some views have internal sub-panels (layers panel inside the sprite editor, entity inspector inside the scene view) that:

- Should be freely resizable and reorderable within their parent.
- Must not be draggable into the global workspace.

There is currently no concept of a constrained region. `SplitContainer` is resize-only. The global workspace drag system has no notion of boundaries.

### 2.2 Solution: `ConstrainedWorkspace`

Introduce a new component, `ConstrainedWorkspace`, that is a self-contained version of the global workspace layout system scoped to a subtree. It is used wherever a view needs internal panels.

`ConstrainedWorkspace`:

- Has its own layout tree (same `SplitNode` structure as the global workspace).
- Has its own drag-to-dock logic (same mechanics: drag a tab, hit-test within the constrained region, dock to a sub-region or reorder within a tab strip).
- **Does not emit drop targets to the global workspace.** Drag events are stopped at the `ConstrainedWorkspace` boundary (`dragenter`/`dragover` are not allowed to bubble out, and the constrained workspace does not register its drop zones with the global dock-zones system).
- Has its own persistence key so its layout is saved independently.

Visually, a tab being dragged within a `ConstrainedWorkspace` shows the same drop overlays it would globally, but only within the constrained region's bounds. Dragging outside the boundary snaps the tab back (same `dragSnapToOrigin` behaviour already used globally).

The constrained workspace does not need to support all global workspace features at launch. Required: resize, tab reorder within a strip, drag to adjacent sub-region. Not required: saving/restoring sizes across sessions (nice to have, not blocking).

### 2.3 Usage

**Scene view:**

The scene view becomes a `ConstrainedWorkspace` containing:

- The scene canvas (non-closable, non-movable anchor — it is always present).
- The entity inspector panel (opens when an entity is selected, constrained within the scene layout, closable).

The entity inspector no longer opens as a global docked-right panel. It opens inside the scene's `ConstrainedWorkspace`.

**Sprite editor:**

The sprite editor becomes a `ConstrainedWorkspace` containing:

- The sprite canvas.
- The layers panel.

Both are already split via `SplitContainer`. This is replaced with `ConstrainedWorkspace`, gaining reorder/drag support.

### 2.4 Global Workspace Interaction

The global workspace is unaware of what is inside a `ConstrainedWorkspace`. It treats the entire view (e.g. "sprite editor") as a single opaque tab. Dragging the sprite editor tab in the global workspace moves the whole thing, constrained internals included.

---

## 3. Scene Tree Cleanup

### 3.1 What Gets Removed

The asset glob import (`src/game/assets/*`) and any representation of those files in the scene tree is removed entirely. Assets live in the asset browser.

### 3.2 What Remains

The scene tree shows strictly scene content: entities and their component summary. This is what it already does, minus the asset cruft.

### 3.3 World-level Properties

The tree gains a small header section above the entity list showing world-level properties. Exactly what appears here is deferred until the Scene system rewrite (the world-to-scene transition). At that point, the scene system should expose a declared list of inspectable properties; the tree renders them.

For now, note the seam: the tree header is a reserved slot for world/scene metadata. It renders nothing (or a placeholder) until the scene system lands.

---

## 4. Build Order

1. **`vite-plugin-fs`** — prerequisite for everything. Clean up existing POC plugins at the same time.
2. **Asset Browser view** — the panel, navigation, thumbnails, context menus. No drag-and-drop yet.
3. **Scene tree cleanup** — remove asset glob + asset items from the tree. No regressions; asset browser covers the gap.
4. **`ConstrainedWorkspace`** — the layout primitive. Wire it into the sprite editor first (lower risk than the scene view).
5. **Scene view constrained layout** — move the entity inspector into the scene's `ConstrainedWorkspace`.
6. **Asset drop registry + inspector @image fields** — drag-and-drop from the asset browser into the inspector.
7. **World-level property header** — stub slot now, filled in during the scene system rewrite.

---

## 5. Open Questions / Deferred

- **Project root decoupling** — `src/game/assets` is hardcoded. Revisit when the game layer is extracted into its own project.
- **Prefab drop handler** — hook is registered in the drop registry, implementation deferred until prefab system matures.
- **`@image` vs `@file`** — decide whether `@image` is a separate decorator or a parameter on `@file` (e.g. `@file({ kind: "image" })`). Either works; decide before implementing the inspector field.
- **Asset browser multi-select** — useful for bulk delete/move but not needed for the initial cut.
- **ConstrainedWorkspace persistence** — save/restore internal layout sizes to localStorage. Not blocking for launch.
