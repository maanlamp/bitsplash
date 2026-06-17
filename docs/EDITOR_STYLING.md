# Editor Style Guide

The canonical rules for the editor's UI. Obey them when building or changing editor
UI; when a new unique element doesn't fit, **ask before guessing**.

## Regions & depth

- **Communicate regions by surface, not by lines.** Distinguish UI areas with
  surface _tone_ (Material 3 tonal surfaces — see
  https://m3.material.io/styles/color/roles), plus **padding and gaps**. Reach for
  borders only as a last resort.
- **Borders are rare.** Allowed for:
  - **Floating / detached surfaces** (toolbars, menus, popovers, dialogs) — a subtle
    border helps them separate from the backdrop since we're dark-mode and can't lean
    on shadows.
  - **Dense grids / compact widgets** (e.g. the timeline) — subtle lines may earn
    their place to help parse the grid.
  - **Menu / list separators** — dividers are fine; dense UI should use a line rather
    than waste space on a gap.
  - Adjacent **panels that share a flush edge** are _not_ a license for a divider
    border — separate them with a **gap + surface tone**, not a line.
- **Layout = slots on a background.** The app is a background **surface** with panels
  laid out as **rounded, tonally-raised slots** floating on it, separated by **padding
  and gaps** — no dividing borders. The whole UI should read as one piece with slots
  for each panel. Resizable seams render a **centred thumb** in the gap to signal
  draggability (not a border/handle bar). See Material 3's layout anatomy:
  https://m3.material.io/foundations/layout/layout-overview/parts-of-layout.
- **No line is ever one pixel.** Borders, outlines, and dividers are all at least
  `var(--border-width)` (2px) — a hairline reads as a rendering glitch, not a
  deliberate edge. Never hand-write `1px`; use the token so the floor holds.
- **Depth = lighter layer on top.** A surface that sits atop another is _lightened_
  (tonal step up). Context menus are the current good example (border + surface
  lightening).
- **`box-shadow` as an outline-ring** (e.g. a selection ring) is fine — that's not
  using shadow to fake depth.
- **Stacking: prefer paint order + `isolation: isolate` over `z-index`.** `z-index` is
  global and not animatable, so it leaks stacking bugs across surfaces (e.g. app
  content painting over a popup mid-transition). Layer via DOM/layout order instead —
  it's local. When you genuinely need `z-index`, scope it with `isolation: isolate` on
  the parent so it can't escape. **Never** use a negative `z-index` to put a layer
  behind siblings — it's the classic leak; lift the siblings into the positioned layer
  and rely on order (the glass mixin does this for its blur/edge layers).
- **Glassy where floating — no exceptions.** _Every_ detached surface (dialogs,
  popovers, menus, toolbars) is **semi-transparent + `backdrop-filter: blur()`**.
  This is not optional and not "where convenient": if it floats over the app, it is
  glass. Compose the glass class (`surface.surface`, or `surface.dialogPopup` for
  modals — see below), **never** paint a detached surface with an opaque
  `background:` of its own. An opaque panel floating over the world is the single
  most common way this rule gets broken — if you find yourself writing
  `background: var(--surface-raised)` on a floating element, stop.
- **Glass comes from the `glass-surface` mixin — only.** Never hand-roll it and never
  put `backdrop-filter` (or a glass `background`/`border`) directly on a host:
  `@include g.glass-surface(...)` (`src/editor/styles/_glass.scss`). The blur, the
  rounding, and the refractive edge are all handled there and were fiddly to get right
  — don't reinvent them. Tune per surface with CSS vars (a host `background` won't
  work — it paints _under_ the blur): `--glass-tint` for the fill, the
  `--glass-edge-*` tokens for the edge; pass `$radius` / `$radius-px` / `$position` as
  mixin args. **The toolbar, context menu, and dialogs are the canonical examples —
  copy one of them.**

## Overlays & dialogs

- **Modal dialogs centre on the viewport** — both axes. Reuse the shared
  `surface.dialogPopup` (already glassy, centred, animated); don't reinvent
  positioning. A dialog pinned to the top or a corner is a bug.
- **A modal backdrop _darkens_, it doesn't lighten.** A modal isn't a translucent
  overlay sitting on top — it's a _mode_ that disables the rest of the app, so the
  app behind it should read as dimmed/deactivated. The backdrop (`--scrim`) is a
  dark wash, not a light one — even though the normal "lighter layer on top" depth
  rule would suggest otherwise. This is the deliberate exception to that rule.
- **A dialog's panel class does layout only** — `display`, `gap`, `padding`,
  `min-width`. It must **not** set its own `background`, `border`, or
  `border-radius`; those come from the shared glass class. (This is precisely the
  split that broke before: a positioning-only wrapper plus an opaque panel = a
  non-glassy dialog.)
- **Dialogs animate in _and_ out.** Per Motion, every state change is animated —
  that includes a dialog appearing and dismissing. base-ui plays the enter/exit
  transitions (the `dialogPopup`/`backdrop` `data-starting-style` /
  `data-ending-style` rules) only if the component **stays mounted** across the
  change. So drive an **`open` prop** (`<ConfirmDialog open={…} />`) and keep it
  rendered — **never** gate the whole dialog behind `{cond && <Dialog/>}`, which rips
  it out before the exit can play.
- See **Copywriting** for what dialogs actually say.

## Shape

- **Almost everything is at least slightly rounded** — friendly, but not so round it
  stops feeling "serious". Use the `--radius-*` tokens; don't hand-pick px.
- **Radius scales with the surface's size and detachment.** Big, floating, or
  prominent surfaces (dialogs, popovers, toolbars, primary buttons) take the
  **larger** radius (`--radius-lg`); small dense affordances (chips, list rows,
  thumbnails) take `--radius-sm`/`--radius-md`. **Never put the sharp end of the
  scale on a large floating panel** — `--radius-md` (4px) on a dialog reads as
  cheap and severe. When unsure, round _more_, not less.
- **Nested corners are concentric.** When a rounded container wraps rounded children
  with padding between them (a toggle group around its buttons, a panel around a
  card), the outer radius must equal the **child radius + the padding** —
  `calc(var(--radius-xl) + var(--unit-2))` — so the gap around each corner is even.
  A container radius _smaller_ than its child's leaves the child's corner poking past
  a tighter outer corner, which reads as inconsistent padding.

## Color

- **Prefer fewer surface colors, not more.** Encapsulate combinations in **design
  tokens** so reuse is forced and new features can't mint one-off color combos.
- Never hardcode a color that a token could express. Use the **semantic tokens**
  (`--surface*`, `--on-surface*`, `--border*`, `--accent*`, `--state-*`), not raw
  `--color-neutral-N`.
- **CSS color literals in JS/JSX** are acceptable **only** where CSS variables can't
  reach (canvas/WebGL fills, a `<canvas>`-drawn waveform). Everywhere CSS can express
  it, use tokens.

## Spacing & type tokens

- **Spacing is the linear `--unit-N` scale** (`tokens.scss` generates `--unit-0…48`,
  where `--unit-N` = N px). Reference `var(--unit-N)`. Don't hardcode px/rem and don't
  reach for a generator function in declarations.
- **Be generous — don't squish.** Tokens say _which_ values are legal, not _how
  much_ to use, and the default failure mode is cramming things together. Let
  elements breathe: separate things with real **gap** instead of letting them touch,
  and give containers real **padding** instead of hugging their contents. For a
  floating panel or dialog, interior padding starts around `--unit-20`/`--unit-24`
  and content gaps around `--unit-12`/`--unit-16` — not `--unit-4`. Buttons want
  horizontal padding that visibly frames the label, not a tight wrap. When a layout
  feels cramped, the fix is almost always more space, not less.
- **Type uses `--text-xs…2xl`**, which are hand-picked `--unit` levels (a forced,
  slightly non-linear ramp). Compose text via the **font role tokens** — `--font-body`,
  `--font-body-strong`, `--font-heading`, `--font-caption`, `--font-kbd`, `--font-hud`
  — not ad-hoc `font-size`/`font-weight`.

## Interactivity (mandatory for every interactive element)

- **Hover** styles (where applicable).
- **Focus** styles — prefer `:focus-visible` to avoid clutter. The focus ring needs
  an **outline gap** — never flush against the element. Use `outline-offset:
var(--focus-ring-offset)` (the shared button/field/control mixins already do).
  The only exception is a ring that _must_ sit inset to avoid being clipped by an
  overflow container (e.g. flush list rows) — there a small negative offset is fine.
- **Cursor** signals affordance: `pointer` = clickable, `text` = selectable/text
  input, `not-allowed` = disabled, `grab`/`grabbing`, `ew-resize`, etc.

## Accessibility

- **Every icon-only button must have a tooltip.** Any button whose content is just an
  icon (no visible text) must be wrapped in the shared `Tooltip`
  (`src/editor/tooltip.tsx`) naming its action, so it's labelled and discoverable.
  Buttons with visible text don't need one.

## Copywriting

Words get the same care as pixels. The voice is **clear and direct, with a touch of
casual** — never stiff, never corporate, never verbose.

- **Say it short.** "Do X?" means exactly what "Are you sure you want to do X?"
  means — use the short one. Cut every word that isn't carrying weight. Concise and
  clear beats padded-and-polite every time.
- **Dialog titles are yes/no questions.** Phrase the title so it can be answered yes
  or no ("Discard your changes?"). That unlocks button labels like **"No, keep"** /
  **"Yes, discard"** — the leading _yes/no_ word is deliberately harder to skim, and
  a confirm dialog _should_ make the user slow down and actually read before acting.
- **The description says _why_ — not _what_.** We just interrupted the user and put a
  dialog in their face instead of doing what they asked; the description's job is to
  explain _why we didn't just do it_. Don't restate the title, don't narrate the
  obvious ("Your changes will be lost"), don't pad. One tight sentence.
- **Title and buttons share the verb; the description must not.** Title, description,
  and buttons each have a distinct job. The **title asks the yes/no** ("Discard your
  changes?") and the **confirming button repeats that verb** ("Yes, discard") — that
  echo is deliberate: it makes the consequence of the click unmistakable. The
  **description carries only the _why_** and must avoid the verb, or the copy turns
  redundant and awkward ("Your changes here haven't been saved yet." — not "…will be
  discarded").
- **Never offer two near-synonyms.** "Cancel" and "Discard" side by side read as the
  same thing at a glance. Pair **opposites**: "Keep" vs "Discard", "Stay" vs "Leave".
- **"Cancel" is never the "no".** Don't use "Cancel" as the dismiss/negative option.
  Name the real outcome instead — "Keep", "Stay", "Don't delete". (It's fine as a
  literal "abort this in-progress operation", just not as a generic "no".)

## Motion

- **Animate every visual state change** to give context — but **snappy**.
- Use React Motion for layout animations.
- For duration, use the tokens: `--duration-fast` (100ms), `--ease-standard`.
- base-ui popups: transition + `&[data-starting-style]` / `&[data-ending-style]`
  (scale from `var(--transform-origin)`), as `surface.surface` / `controls.tooltip` do.
- Native elements: use **`@starting-style`** or CSS transitions.

## Styling mechanics

- **Inline `style={{}}` is almost never allowed.** If a CSS solution is possible, use
  a class. Reach for inline / CSS-in-JS **only** when expressing it in CSS would be
  _extremely_ convoluted — i.e. genuinely dynamic, per-render computed values (a
  pixel position from a measurement, a `gridTemplate` derived from data, a
  data-driven color). Static styling **never** goes inline.
  - For dynamic-but-bounded values, prefer passing a **CSS custom property** via
    `style` and consuming it in the stylesheet (`style={{ "--x": v }}` + `left: var(--x)`)
    over inlining the whole declaration.
- **Files:** styles live in **small, per-concern files colocated with their
  component** (`toolbar.module.scss` next to `toolbar.tsx`), imported where used.
  Shared editor primitives live in `src/editor/styles/`. Only true globals (reset,
  tokens, body defs) stay in `src/style/`.

## Components

- **Always prefer base-ui (`@base-ui/react`) primitives** over hand-rolled ones.
  - `title=""` tooltips → base-ui `Tooltip`.
  - Custom modal/overlay divs → base-ui `Dialog`.
  - Custom dropdowns/checkboxes/toggles → base-ui equivalents.
  - `react-aria-components` is allowed **only** for the scene `Tree` (base-ui has no
    Tree); base-ui is the default everywhere else.
- **Use the shared `Button`** (`src/editor/button.tsx`; variants
  `text`/`icon`/`primary`/`secondary`/`tertiary`, over base-ui `Button`) instead of
  styling raw `<button>`. Build similar shared wrappers for other repeated patterns.

## Exemplars already in the tree (copy these)

- **Glassy surfaces — the toolbar, context menu, and dialogs.** These three are the
  canonical glass treatments (via the `glass-surface` mixin); copy one rather than
  hand-rolling blur/edge/tint on a new floating surface. The **toolbar**
  (`toolbar.module.scss`) is backgroundless pure-blur with an inner `toggleGroup` that
  reads as one input group; the **context menu** (`asset-context-menu.tsx` /
  `surface.menu`) is a lightly-tinted lifted surface; **dialogs**
  (`confirm-dialog.tsx` + `surface.dialogPopup`) are the reference modal — glassy,
  viewport-centred, generously padded, with yes/no copy, the panel class doing layout
  only.
