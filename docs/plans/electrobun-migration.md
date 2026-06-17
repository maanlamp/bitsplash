# Plan: Move the editor shell from browser-only to Electrobun

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

- **Electrobun is beta.** ~2k commits, active, but pre-1.0. API churn is likely.
  We're betting on a young project. Electron is the boring-but-safe alternative
  if Electrobun bites us; the architecture in this plan (thin Bun main + existing
  Vite app in a webview + an FS RPC bridge) is shell-agnostic, so a fallback to
  Electron later is not a rewrite.
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

## Open questions for you (UX / scope — not mine to decide)

1. **Editor: desktop-only or dual-target?** Keep the `fetch("/__…")` Vite
   middleware path as a browser fallback, or commit to desktop-only and delete
   the middlewares? (Affects whether `project-io.ts` needs two backends.)
2. **Failure surfacing for FS ops.** When a save/upload fails on disk now (real
   FS, real permission/space errors), how should the editor surface it — toast,
   blocking dialog, inline? Today it's a bare `fetch` with minimal handling.
3. **Where does the project live?** Do we always edit the repo's
   `src/game/levels` + `src/game/assets` in-place (current behaviour), or should
   the desktop app open an arbitrary project folder (open-folder flow)? The
   latter is a bigger feature; the former is the drop-in.
4. **Risk appetite on Electrobun beta** — comfortable betting on pre-1.0, given
   the Electron fallback path stays open?

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
