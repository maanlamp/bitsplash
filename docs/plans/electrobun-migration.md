# Plan: Move the editor shell from browser-only to a desktop shell

> **PIVOT (2026-06-17): the shell is Electron, not Electrobun.** Electrobun ships
> no Windows **arm64** build (only `win-x64`); on this arm64 machine its x64
> runtime hangs at native init and no window appears (verified against the v1.18.1
> release assets + by running the built main directly). Electron ships native
> win32-arm64, so it runs without emulation. The migration architecture below is
> shell-agnostic, so the pivot reused everything except the Electrobun-specific
> glue. Electrobun-specific text below is kept for the post-mortem; the
> **Implementation status** section reflects the actual Electron implementation.

## Why we're doing this

The **game** must keep running in every modern browser. The **editor** does not —
we just need to author our game with full power: real filesystem access, no
browser-reserved shortcut conflicts (Tab, Ctrl+W, Ctrl+N, etc.), no security
sandbox fighting us. We want to pick a desktop shell now, while the app is still
small enough that the migration is conceptually simple, rather than after the
editor has grown more browser-coupling.

Chosen shell: **[Electrobun](https://github.com/blackboardsh/electrobun)** —
Electron-like but Bun-native (we already use Bun), uses the OS's system webview
instead of bundling Chromium (~14 MB baseline vs Electron's ~100+ MB), tiny
binary-diff updates, RPC between a Bun "main" process and the webview.

## Reality check / things to know before committing

These are flagged honestly rather than buried (matches the "industry pushback"
preference):

- **Electrobun maturity — corrected.** The plan originally assumed pre-1.0 beta;
  the published package is in fact **`electrobun@1.18.1`** (stable, May 2026), with
  a `1.18.x-beta` channel. More mature than feared. API churn is still possible on a
  young project, so Electron stays the documented fallback; the architecture here
  (thin Bun main + existing Vite app in a webview + an FS RPC bridge) is
  shell-agnostic, so a fallback to Electron later is not a rewrite.
- **System webview ≠ "all browsers".** Electrobun renders in WebKit (macOS),
  WebView2/Chromium (Windows), WebKit2GTK (Linux). That is _fine for the editor_
  (we explicitly stopped caring about browser-universality there). It does mean
  the editor is no longer a free cross-browser smoke-test for the game — we must
  keep a real browser build for the game and test the game there separately.
- **Platform floor:** macOS 14+, Windows 11+, Ubuntu 22.04+. We're on Windows 11,
  so fine for now.
- **The game stays a pure web build.** We keep producing the deployable Vite
  bundle exactly as today. Electrobun wraps the _same_ app for editing; it does
  not replace `vite build` for the web game.

## Current state (what we're migrating)

- Single Vite + React 19 app: `index.html` → `src/main.tsx` → `src/editor/app`.
  Game code (`src/game/...`) is imported into the same bundle.
- Bun toolchain; oxlint/oxfmt; React Compiler via `@vitejs/plugin-react` +
  `@rolldown/plugin-babel` (decorators plugin). All of this is just Vite output —
  it loads into a webview unchanged.
- **The filesystem hack we'll replace:** two Vite dev-server middlewares in
  `vite.config.ts` give the editor FS access today:
  - `POST /__save-level` → writes `src/game/levels/<id>.scene.json`
  - `POST /__upload-asset` → writes `src/game/assets/<file>`
    Callers: `src/editor/app.tsx:123`, `src/editor/audio/audio-editor.tsx:229,242`,
    `src/editor/sprite/sprite-editor.tsx:80,97`.
    These only work while the Vite dev server is running — i.e. authoring is
    currently coupled to `bun run dev`. Electrobun makes this real.
- Hotkeys via `react-hotkeys-hook` in `src/editor/app.tsx` (many `preventDefault`
  calls). Browser-reserved combos are the pain point that triggered this move.

## Target architecture

Two processes, RPC between them (Electrobun's model):

```
┌─ Bun main process (src/desktop/main.ts) ──────────────┐
│  • creates the BrowserWindow                          │
│  • dev:  loads http://localhost:5173 (Vite dev server)│
│  • prod: loads views://mainview/index.html (built)    │
│  • owns the filesystem: save level / upload asset /   │
│    read project — exposed as typed RPC handlers       │
└───────────────────────────────────────────────────────┘
                  ▲ typed RPC (replaces fetch to __* middlewares)
                  ▼
┌─ Webview (our existing Vite + React app, unchanged) ──┐
│  • src/editor/* + src/game/* exactly as today         │
│  • FS calls go through a small bridge module instead  │
│    of fetch("/__save-level")                          │
└───────────────────────────────────────────────────────┘
```

Key idea: **the React app barely changes.** We introduce one abstraction —
a "project IO" module — behind which the implementation is either the Electrobun
RPC (desktop) or the existing `fetch("/__…")` (kept as a web/dev fallback if we
want). Everything else (engine, game, rendering, editor UI) is untouched.

## Step-by-step

### 1. Spike it (timebox ~half a day) before wholesale changes

- `bunx electrobun init` in a scratch dir; confirm it builds and opens a window
  on Windows 11 with WebView2.
- Confirm you can point its `BrowserWindow` at an arbitrary URL
  (`http://localhost:5173`) so our Vite dev server can drive the webview with HMR.
- Confirm a round-trip RPC call (webview → bun → return value) works.
- **Gate:** if any of these three fight us hard, stop and reconsider (Electron).

### 2. Add Electrobun to the repo without disturbing the web build

- `bun add -d electrobun` (or whatever the init scaffolds).
- New files:
  - `electrobun.config` — app metadata + build config. Point its bundled-views
    source at Vite's `dist/`.
  - `src/desktop/main.ts` — the Bun main process (window creation + RPC handlers).
- Do **not** move `src/main.tsx`, `index.html`, or any editor/game code. The
  webview loads our existing entry.

### 3. Wire dev vs prod loading

- Main process picks the URL:
  - dev: `http://localhost:5173` (Vite dev server, HMR intact)
  - prod: `views://mainview/index.html` (Vite-built `dist`, bundled by Electrobun)
- Dev workflow becomes: run Vite dev server **and** launch Electrobun pointed at
  it. We'll add a script that does both (e.g. `bun run dev:desktop`).

### 4. Build the FS RPC bridge (the real win)

- In `src/desktop/main.ts`, implement RPC handlers that do what the Vite
  middlewares do today, but against the real project on disk:
  - `saveLevel(sceneId, json)` → write `src/game/levels/<id>.scene.json`
    (keep the `^[\w-]+$` id guard).
  - `uploadAsset(filename, bytes, { overwrite })` → write `src/game/assets/<safe>`
    (keep `basename` sanitisation + the overwrite/skip behaviour, return the
    `/src/game/assets/<safe>` url).
- Add `src/editor/project-io.ts` (or similar) exposing `saveLevel`/`uploadAsset`.
  Implementation calls Electrobun RPC when running in the desktop shell.
- Replace the four `fetch("/__save-level" | "/__upload-asset")` call sites with
  the bridge:
  - `src/editor/app.tsx:123`
  - `src/editor/audio/audio-editor.tsx:229, 242`
  - `src/editor/sprite/sprite-editor.tsx:80, 97`
- **Decision needed (don't assume):** do we keep the Vite middlewares as a
  browser/dev fallback, or delete them and make the editor desktop-only? See
  Open Questions.

### 5. Hotkeys / shortcuts

- Once in a webview we can intercept Tab and other previously-reserved combos.
- Two paths, to be chosen with the user: (a) keep `react-hotkeys-hook` in the
  webview and rely on the webview no longer reserving those combos, or (b) move
  app-level accelerators to a native menu in the Bun main process. Likely (a) for
  most, (b) only for true app-global commands. Revisit `src/editor/app.tsx`
  hotkey block after the shell works.

### 6. Scripts & build

- `package.json` additions (names TBD):
  - `dev:desktop` — Vite dev server + Electrobun pointed at localhost.
  - `build:desktop:dev` / `build:desktop:release` — `vite build` then Electrobun
    bundle of `dist`.
- **Unchanged:** `dev`, `build` (`tsc -b && vite build`), `preview` keep
  producing the browser game. The web game deploy path is not touched.
- `bun check` (oxlint/oxfmt/tsc) must still pass; make sure `src/desktop/*.ts`
  is covered by a tsconfig (it runs under Bun, not the browser — may want a
  separate `tsconfig.desktop.json` so DOM vs Bun globals don't bleed).

### 7. Verify & document

- Manually verify in the desktop shell: open editor, edit a level, save → confirm
  `*.scene.json` actually changed on disk; upload a sprite/wav → confirm the file
  lands in `src/game/assets`; play a scene in-editor; exercise the Tab shortcut
  that was previously blocked.
- Verify the **web game build still runs in a real browser** (`bun run build` +
  `bun run preview`), since the editor is no longer that canary.
- Update `README.md` progress markers as we land each piece (per project habit).

## Open questions — RESOLVED (2026-06-17)

1. **Editor: desktop-only or dual-target?** → **Desktop-only.** The two Vite
   middlewares are deleted; `project-io.ts` has a single Electrobun RPC backend.
   (The `*.scene.json` HMR-suppression plugin was kept in `vite.config.ts` so
   saving a level under the watched dir doesn't full-reload the editor.)
2. **Failure surfacing for FS ops.** → **Don't handle it.** Not a concern; the
   bridge stays as bare as the old `fetch` path (the "already exists" `alert` is
   preserved via the `existed` flag).
3. **Where does the project live?** → **In-place repo dirs** (`src/game/levels` +
   `src/game/assets`), exactly as before. Open-folder flow is deferred; the main
   process resolves the project root by walking up from `cwd`, so swapping it later
   is contained. (Note: under `electrobun dev` the Bun process `cwd` is the built
   `…/bin` dir, hence the upward walk to find `src/game/levels`.)
4. **Risk appetite.** → **Proceed with Electrobun** (and it's 1.18.1 stable, not
   pre-1.0 — see Reality check), Electron documented as the fallback.

## Implementation status (2026-06-17) — Electron

- Files: `src/desktop/main.cjs` (Electron main — window, waits for the dev server
  then loads it / else `dist/index.html`, `ipcMain.handle` for `saveLevel` +
  `uploadAsset`, project root resolved relative to the file), `src/desktop/preload.cjs`
  (`contextBridge` exposing the two calls; context isolation on, no node
  integration), `src/project-rpc.ts` (shared payload types), `src/editor/project-io.ts`
  (calls `window.bitsplashDesktop`). All four call sites migrated; the two Vite FS
  middlewares removed (editor is desktop-only); `*.scene.json` HMR suppression kept.
- `bun run dev` is the single command: starts Vite + `electron src/desktop/main.cjs`
  together (via `concurrently`) and opens the editor in the Electron window instead
  of a browser tab (`server.open` removed; main process waits for Vite).
  `build`/`preview` unchanged (web game).
- The `.cjs` main/preload are plain CommonJS (not TS) — they run in Electron's Node
  and aren't part of the `tsc -b` program, which avoided the Bun/electrobun type
  gymnastics the Electrobun attempt needed. The renderer side stays typed via
  `project-rpc.ts`.
- **Dependencies (user installs — Bun install is broken on this machine):** removed
  `electrobun` (+ the unused `@types/bun`); needs `electron` added as a dev dep.
  `concurrently` stays.
- Not yet verified (needs a manual GUI pass once `electron` is installed): window
  opens, save-a-level changes the file on disk, sprite/wav upload lands in `assets`,
  Tab shortcut.
- Local env note: `bun install`/`bun add`/`bun remove` corrupt installs on this
  machine (empty package dirs — Windows arm64 + Bun). The user manages deps;
  don't re-run installs here.

### Electrobun post-mortem (what was tried and why it was dropped)

- Built fully against Electrobun 1.18.1: `electrobun.config.ts`, a Bun
  `src/desktop/main.ts` with `BrowserView.defineRPC`, an `Electroview` bridge,
  `tsconfig.desktop.json` (+ a `declare module "three"` shim and Bun/Node libs to
  get Electrobun's shipped `.ts` to typecheck). `bun check`, `vite build`, and
  `electrobun build` all passed; `electrobun dev` _bundled_ fine.
- It never opened a window on this arm64 machine. Root cause: no `win-arm64`
  Electrobun release; the x64 runtime hangs at `Loading app code from flat files`.
  Not fixable in our code. → pivoted to Electron (above).

## What stays exactly the same

- Engine, game runtime, ECS, planck, rendering, audio graph.
- The game's browser deployment and its cross-browser requirement.
- Vite as the bundler; React Compiler / babel decorators pipeline.
- All editor React components and stores (only the 4 FS call sites change).

## Sources

- [Electrobun (GitHub)](https://github.com/blackboardsh/electrobun)
- [Electrobun docs](https://blackboard.sh/electrobun/docs/)
- Dev/prod webview URL pattern (mirrors the Electron + Vite idiom):
  [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)
