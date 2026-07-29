# Notes

Working notes from implementation sessions: verified codebase findings, and the
record of decisions taken while building from a plan.

These are **session artifacts, not curated documentation** — a staging area. They
were written to be handed to implementors, so they are dense, reference
`file:line`, and go stale as the code moves. Treat them as evidence of what was
true and why a choice was made, never as a spec. `AGENTS.md`, `docs/plans/` and
the code itself are authoritative.

Refactoring these into proper docs (or deleting the parts that have served their
purpose) is expected.

## Current contents

From the weather + VFX implementation session (2026-07-29), building
`docs/plans/2026-07-21-feature-weather-system.md`:

- **`weather-decisions.md`** — every decision made during that session, including
  the ones that deviated from the plan and why. Includes what the
  audio-foundations plan still owes, since weather's audio shipped interim.
- **`notes-audio.md`** — the state of `engine/audio/` and the four design
  decisions it forced. The main input for an audio-foundations planning session.
- **`notes-renderer.md`** — the quad/batching path, per-draw blend threading
  sites, and the render-layer full-viewport-target cost trap.
- **`notes-ecs-editor.md`** — serialization decorators, the edit-world save
  tripwire, `compositions.ts` layout, inspector renderer precedents, the
  focused-view tick model.
- **`notes-sequence-tilemap-tests.md`** — sequence op lifecycle (including three
  corrections to the weather plan), `TileGrid`/occupancy facts, the test harness.
- **`contracts-phase2.md`** — the API surface later workstreams in that session
  built against.
