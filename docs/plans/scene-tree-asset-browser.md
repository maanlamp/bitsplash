# Plan: Asset Browser

> Status: Draft  
> Depends on: nothing upstream (self-contained editor work)  
> Unlocks: prefab drag-spawn, @image inspector fields, scene system cleanup

---

## 1. Asset Browser

### 1.1 Asset Browser View

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

### 1.2 Drag and Drop

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

### 1.3 Inspector @image Fields

When the inspector renders a component field decorated with `@image`, it renders a compact field group:

- A **clickable image preview** that doubles as the file picker trigger. If a path is set, it renders the image; if not, it renders a placeholder with a "Choose image..." label. Clicking either opens a file picker scoped to the asset browser root.
- The resolved path as text beneath the preview.
- Width × height of the loaded image, shown as a small caption.

There is no separate "Choose file..." button. The preview is the button.

When a drag interaction is detected anywhere over the field group (`dragenter`), the preview area switches to a dropzone state (highlighted border, "Drop image here" overlay). On `drop`, it validates the payload type is `sprite` or `tileset`, then calls the drop registry handler which updates the field.

This is self-contained to the inspector field renderer. No changes to the engine component decorators are needed beyond adding `@image` as a recognised decorator type.

---

## 2. Scene Tree Cleanup

### 2.1 What Gets Removed

The asset glob import (`src/game/assets/*`) and any representation of those files in the scene tree is removed entirely. Assets live in the asset browser.

### 2.2 What Remains

The scene tree shows strictly scene content: entities and their component summary. This is what it already does, minus the asset cruft.

### 2.3 World-level Properties

The tree gains a small header section above the entity list showing world-level properties. Exactly what appears here is deferred until the Scene system rewrite (the world-to-scene transition). At that point, the scene system should expose a declared list of inspectable properties; the tree renders them.

For now, note the seam: the tree header is a reserved slot for world/scene metadata. It renders nothing (or a placeholder) until the scene system lands.

---

## 4. Build Order

1. **Asset Browser view** — the panel, navigation, thumbnails, context menus. No drag-and-drop yet.
2. **Scene tree cleanup** — remove asset glob + asset items from the tree. No regressions; asset browser covers the gap.
3. **Asset drop registry + inspector @image fields** — drag-and-drop from the asset browser into the inspector.
4. **World-level property header** — stub slot now, filled in during the scene system rewrite.

---

## 5. Open Questions / Deferred

- **Project root decoupling** — `src/game/assets` is hardcoded. Revisit when the game layer is extracted into its own project.
- **Prefab drop handler** — hook is registered in the drop registry, implementation deferred until prefab system matures.
- **`@image` vs `@file`** — decide whether `@image` is a separate decorator or a parameter on `@file` (e.g. `@file({ kind: "image" })`). Either works; decide before implementing the inspector field.
- **Asset browser multi-select** — useful for bulk delete/move but not needed for the initial cut.
- **ConstrainedWorkspace persistence** — save/restore internal layout sizes to localStorage. Not blocking for launch.
