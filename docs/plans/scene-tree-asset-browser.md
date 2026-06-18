# Plan: Asset Browser

> Status: Agreed (interviewed)
> Depends on: nothing upstream (self-contained editor work)
> Unlocks: prefab drag-spawn, image inspector fields, scene properties editing

---

## 0. Filesystem layer (foundational — everything depends on this)

All filesystem access goes through the existing Electron IPC bridge
(`src/desktop/main.cjs`, `src/desktop/preload.cjs`, typed in `src/project-rpc.ts`,
wrapped in `src/editor/project-io.ts`). There is **no** HTTP `/_fs` server — that
would only work in dev, not in a packaged build.

New IPC operations alongside the existing `saveLevel` / `uploadAsset`:

- `getAssetsRoot()` — absolute path of `src/game/assets`.
- `listDir(path)` — entries for a directory (name, absolute path, isDirectory).
- `listAssetsDeep()` — recursive walk of the assets root, returns the existing
  `AssetEntry[]` shape (used to seed view-validation; see §2).
- `rename(path, newName)`.
- `del(path)` — moves the target into the app-owned `.trash` (see §1.5), returns
  a token allowing restore.
- `restore(token)` — moves a trashed item back to its original path.
- `mkdir(parentPath, name)`.
- `openImageDialog()` — native `dialog.showOpenDialog`, image filter, returns an
  absolute path or null.

Navigation is **unconstrained** — the browser can read/list/mutate anywhere on
disk. This is the point of the feature (filesystem access through the tool);
sandbox bounds are deferred. No path-traversal guard for now.

### 0.1 Image protocol

Image bytes reach `<img>` tags through a custom Electron protocol registered in
the main process: `bitsplash-fs://<absolute-path>`. This gives native Chromium
image decoding and caching for free and works with `<img loading="lazy">`.

The protocol is an **editor-browse mechanism only**. It is never serialized and
never used by the shipped browser game (which has no such protocol).

---

## 1. Asset Browser

### 1.1 Asset Browser View

Registered as a workspace view: `asset-browser`. Singleton, non-closable (like
`tree` / `inspector`). Added to the `ViewKind` union, `renderView`, `viewTitle`,
`isClosable`.

**Default layout:**

```
row[ tree (0.22) | column( scene (0.7) / asset-browser (0.3) ) ]
```

The right pane in `defaultWorkspace` becomes a column split with the scene on top
and the asset browser beneath.

**Layout:**

```
[ location bar: back | forward | up | path segments ]
[ file grid: thumbnails or icons, name labels ]
```

Navigation is back/forward/up plus clickable breadcrumbs. State (current path,
history stack) is local to the view; it resets per session (persistence
deferred). Opens at `getAssetsRoot()` by default.

**Thumbnails:**

| Asset type                 | Thumbnail                                     |
| -------------------------- | --------------------------------------------- |
| `*.png`, `*.jpg`, `*.webp` | `<img src="bitsplash-fs://…" loading="lazy">` |
| `*.tileset.png`            | Same as above                                 |
| `*.font.zip`               | Generic font icon                             |
| `*.wav`, `*.mp3`, `*.ogg`  | Generic audio icon                            |
| `*.json`                   | Generic JSON / file icon                      |
| Directory                  | Folder icon                                   |
| Unknown                    | Generic file icon                             |

Lazy loading is the native `loading="lazy"` attribute — no `IntersectionObserver`,
no app-level cache (the protocol + browser cache cover it).

### 1.2 Asset type classification

One canonical `classifyAsset(path): AssetType` in the editor, keyed on
extension/suffix:

- `*.tileset.png` → `tileset`
- other `*.png` / `*.jpg` / `*.webp` → `sprite`
- `*.wav` / `*.mp3` / `*.ogg` → `audio`
- font extensions / `*.font.zip` → `font`
- `*.prefab.json` → `prefab`
- plain `*.json` and everything else → `unknown`

`AssetType = "sprite" | "tileset" | "audio" | "font" | "prefab" | "unknown"`.

### 1.3 Context menus

Reuse the `AssetContextMenu` pattern + glass surface. Extend it with:

- **Empty space:** New Sprite… / New Tileset… / New Audio… / New Folder…
- **File:** Open / Rename / Delete / _(sep)_ / type-specific (e.g. Edit Sprite)
- **Directory:** Open / Rename / Delete / _(sep)_ / New Sprite… / New Tileset… /
  New Audio… / New Folder…

### 1.4 Create / rename / folder UX

- **Rename** and **New Folder** use **inline** cell editing (text input in the
  grid cell; Enter/blur commits, Escape cancels). New Folder creates `untitled`
  already in edit mode.
- **New Sprite / Tileset / Audio** keep their existing modal dialogs (they need
  width/height).
- **Collisions:** New Folder and copy-in (see §3.2) **auto-suffix** to keep both
  (`untitled 2`, `foo 2.png`). Explicit rename to a taken name **refuses** and
  raises a toast; the cell stays in edit mode.

### 1.5 Undoable filesystem operations

FS mutations (rename, delete, mkdir, copy-in) are **undoable commands** on the
asset-browser view's own per-view history (the existing per-view pattern;
focus-routed Ctrl+Z).

Because FS is async, the history system is made async-aware:

- `Command.undo` / `Command.redo` widen to `() => void | Promise<void>`. Existing
  synchronous ECS commands satisfy the wider type unchanged.
- `History` serializes execution through an internal promise chain (a mutex) so
  rapid undo/redo can never interleave or reorder two async operations.
- A forward op performs its IPC and only pushes the command **on success** — a
  failed op never enters history.
- If an `undo`/`redo` rejects mid-flight (file locked / changed externally), the
  command is **dropped from the timeline** and a toast is shown.

**Delete** moves the target into an app-owned `.trash` directory at the project
root (gitignored). Undo moves it back (an atomic rename — no in-memory byte copy,
handles directories). This is _not_ the OS Recycle Bin.

**Toasts** use the base-ui `Toast` component (new, small editor infra).

### 1.6 Drag and Drop

Native HTML5 drag-and-drop (coexists with Framer Motion, which stays for tab
docking / layer reorder). Browser cells set a typed payload:

```ts
type AssetDragPayload = Readonly<{
	type: "asset-drag";
	path: string; // stored web path or absolute (resolved on drop)
	assetType: AssetType;
}>;
```

Set on `dataTransfer` as JSON under `application/x-bitsplash-asset`.

**Minimal drop registry** (`src/editor/asset-drop-registry.ts`) — built now, but
only one handler registered:

```ts
type DropHandler = (payload: AssetDragPayload, context: DropContext) => void;

type DropContext = Readonly<{
  target: "scene-view" | "inspector-field";
  field?: { entityId: EntityId; componentType: ComponentConstructor; fieldKey: string };
}>;

export const AssetDropRegistry = {
  register(assetType, targets, handler): void,
  resolve(payload, context): DropHandler | null,
};
```

- Registered now: `sprite` / `tileset` on `inspector-field` → updates the field.
- Deferred (seam only): `prefab` on `scene-view` → spawn entity.

The registry lives in the editor. The engine has no involvement.

### 1.7 Inspector image fields

No new decorator — the **existing `@file`** drives this. When a `@file` field's
accept is image-like, the inspector renders a rich image renderer instead of the
plain `FileField`:

- A clickable image preview that is also the picker trigger. With a path set it
  renders the image (via the protocol); empty, it shows a "Choose image…"
  placeholder. Clicking opens the **native OS file dialog** (`openImageDialog`).
- The resolved path as text beneath.
- Width × height caption.

On `dragenter` over the field group, the preview switches to a dropzone state; on
`drop` it validates `assetType` is `sprite`/`tileset` and calls the drop registry
handler. `SpriteComponent.url`'s existing `@file("image/*")` upgrades
automatically.

---

## 2. Scene tree cleanup + enumeration cutover (full)

The Vite glob (`import.meta.glob("../game/assets/*")` in `src/editor/assets.ts`)
is **deleted**. The asset glob is currently load-bearing beyond the tree: it seeds
`app.tsx`'s `assets` state, which `isValidViewId` uses to validate restored
asset-backed view IDs (`sprite:foo.png` etc.), and url→entry lookups.

Replacement:

- `app.tsx`'s `assets` state is seeded asynchronously from the `listAssetsDeep`
  IPC call (same `AssetEntry` shape). View validation / url lookups keep working.
- The scene tree drops its **Assets section** (display only).
- The asset browser uses per-directory `listDir` for navigation.
- All asset byte-loading in the editor (sprite/audio/font editors) resolves via
  the `bitsplash-fs://` protocol instead of glob `?url` strings.

### 2.1 Serialized identity

What is stored in scene/prefab JSON stays a **portable, Vite-servable web path**
(e.g. `/src/game/assets/foo.png`) so the shipped browser game keeps loading
assets unchanged. The protocol is editor-only.

When the user picks or drops an asset into a field:

- In-tree files (under the served project) are referenced in place by web path.
- Out-of-tree files (anywhere on disk, since nav is unconstrained) are **copied
  into `src/game/assets`** first (reusing `uploadAsset`), then the resulting
  in-tree web path is stored.

---

## 3. Scene / world properties

`SceneConfig` (`src/engine/scene/scene.ts`, currently a plain type:
`{ gravity, uiScale?, tileset? }`) is promoted to a `@valueType()` decorated
class with field decorators:

- `gravity: Vector2` (existing `Vector2Field`)
- `uiScale: number`
- `tileset: @file(<tileset accept>)`

It is rendered and edited through the **existing inspector field machinery**
(`FieldControl` / `getValueRenderer`), edits flow through `commit(history, …)`,
and it serializes into `SceneFile.config` as today. This touches the scene
constructor and the game scenes that build config (`platformer.ts`, `pause.ts`).

The existing **"World" tree node** (`world:${sceneId}`) becomes **selectable**;
selecting it populates the **Inspector** panel with the `SceneConfig` fields,
exactly like selecting an entity shows its components. No tree-header slot is
added.

---

## 4. Build order

1. **Foundational layer** — IPC FS ops + `bitsplash-fs://` protocol + async
   `History` + base-ui `Toast`.
2. **Asset Browser view** — panel, navigation, thumbnails, context menus,
   inline rename/new-folder, undoable FS ops. No drag-and-drop yet.
3. **Scene tree cleanup / enumeration cutover** — delete glob, seed from IPC,
   remove Assets section, editors load via protocol.
4. **Drop registry + inspector image fields** — native DnD from browser into the
   `@image` field; copy-in for out-of-tree.
5. **Scene properties** — promote `SceneConfig`, World node → Inspector.

---

## 5. Deferred

- **Multi-select** in the browser (bulk delete/move).
- **Prefab → scene-view drop handler** — registry seam only.
- **Asset-browser nav-history persistence** to localStorage (workspace layout
  still persists via existing `saveWorkspace`).
- **Project-root decoupling** — `ASSETS_DIR` stays the single hardcoded constant.
- **Navigation sandbox bounds** — unconstrained for now.
