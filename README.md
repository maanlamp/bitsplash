<div align="center">

# Bitsplash

<img src="screenshot.png" alt="The Bitsplash editor" width="820" />

_A hand-rolled 2D game engine, its editor, and a browser platformer built on top — all in one repo._

</div>

## Running locally

Bitsplash uses **[Bun](https://bun.sh)** (not npm/node). The editor runs in an **Electron** desktop shell and is developed on Windows.

```sh
bun install
bun run dev      # launches the editor in a desktop window
```

The game itself is a standalone web build — `bun run build`, then `bun run preview` to serve it in a browser.

## Philosophy

Bitsplash is **code-first and hand-rolled**: no game-engine framework, a custom entity-component-system, and a physics layer behind an engine-owned abstraction (backed by [Rapier](https://rapier.rs/)), drawn to an HTML canvas via WebGL2. The codebase is split into three strict layers — a reusable **engine**, an **editor** that authors content on top of it, and the **game** itself — and dependencies only ever point inward; the editor and game must never leak into the engine.

The bias throughout is toward small, composable, **data-driven** systems (JSON scenes, data-file prefabs, metadata-in-assets), behaviour living in **systems rather than object hierarchies** (there is deliberately no scene graph — entities relate by id), and **footgun-free APIs** whose safe, fast path is the default. Everything is meant to be observable and editable from the tooling. The game ships to any modern browser; the editor is a desktop app so it can own the filesystem and reclaim browser-reserved shortcuts.

## Further reading

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — system-by-system progress and build order
- [`docs/EDITOR_STYLING.md`](docs/EDITOR_STYLING.md) — editor UI style guide
- [`docs/plans/`](docs/plans/) — detailed architectural plans per system
- [`agents.md`](agents.md) — codebase orientation for AI agents
