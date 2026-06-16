# Serialization — Opt-In Field Marking with Static Guarantees

Status: **planned** (no implementation yet). Supersedes the unfinished tail of
`architecture-audit.md` Pass 2. Not a critical project-health item — it's an
architectural change that can land at any time.

## 1. Goal

Replace the current **opt-out** serialization (every enumerable field encoded
unless excluded) with an **opt-in** model where a field is persisted only if it
carries a `@serialize()` marker — and make "is this field actually serializable?"
a **compile-time** guarantee rather than a runtime/save-time failure.

The driving principle, in the user's words: _safe-by-default, single-action._ A
component author should not be able to ship an un-serializable component, and a
**player must never be punished for an author's negligence** — so the failure has
to surface at authoring time, never at save/load.

## 2. Why (root cause)

Opt-out is "serialize everything by default." That default silently includes
types that have no encoding (live class instances like the inkjs `Story`, a planck
`Body`, functions). They currently encode to `undefined` and get dropped with no
diagnostic. The audit's Pass 2 added a `@skip` opt-out marker and (then) a
save-time throw, but:

- A save-time throw moves a player-facing crash into save/load — **unacceptable**.
- The dangerous field (`InkStoryComponent.story`) is `null` at rest and only holds
  a live object after the sim runs, so **no value-based check** (save-time throw,
  build-time default-instance scan, editor "inspect" badge) can reliably catch it.
  Only reasoning about the **declared type** catches it.

We assumed the Bevy-style opt-out machinery we copied would be statically analyzable
by TypeScript. It is not: TS decorators are runtime constructs with no type-level
reach, and the codec registry is a runtime `Map`, not a type. Bevy gets its
compile-time guarantee from Rust's trait system (`#[derive(Reflect)]` requires every
field to be `Reflect`); the decorator vocabulary we borrowed never inherited that.

Opt-in fixes this by construction: an unmarked live object is simply **inert** —
never handed to the serializer, so it can never break a player. Both reasons to
exclude a field collapse into one action — _don't mark it_:

- **un-encodable type** (`story`, planck `Body`) → unmarked → safe.
- **encodable but runtime-derived** (`arrow.launched`, `fsm.elapsed`) → unmarked →
  not persisted, satisfying "save = authored state only."

(Note: even Bevy still needs `#[reflect(ignore)]` for the second case — the
"serialize-everything-for-free" default never covered runtime-derived fields.)

## 3. Locked design

Reached through spikes (each verified by `tsc` + a runtime run; spike files
discarded). The shape below is the canonical opt-in pattern: it maps directly onto
.NET `[DataContract]`/`[DataMember]`, Unity `[Serializable]`/`[SerializeField]`,
and serde/Bevy derive macros + manual-impl escape hatch.

### 3.1 One decorator for every serializable type

`@serializable("Name")` is a **class decorator** (not a base class). A `Component`
base class would be pure ceremony here — "component-ness" is conferred by being
attached to an entity in the ECS, not by inheritance, so a base whose only job is
to hold a name earns nothing. The decorator collects field metadata from its
`context.metadata` at decoration time and registers `name → ctor`.

The **same** decorator serves components _and_ value types (`Vector2`, `Angle`,
`FontSettings`). There is no separate `@valueType` — components and value types are
the same thing (a registered, reconstructable serializable type) used in two
positions. Bevy unifies them under one `Reflect` trait; we unify them under one
decorator. The only differences are non-declarative:

- **Format identity** — a top-level component is keyed by name in the entity's
  component map; a nested value is tagged inline with `$type`. Decided by the
  encoder from **position**, not from how the type was declared.
- **ECS role** — orthogonal; not a serialization concern.

### 3.2 Opt-in field marking carries neutral metadata

`@serialize(options?)` marks a field for persistence. Its metadata is a **neutral
descriptor** read by multiple independent consumers — the serializer (which fields
to walk), the editor (how to present the field), and any future system. It is _not_
an editor feature.

```ts
type SerializeOptions = {
	required?: boolean; // was @required
	file?: string; // was @file(accept)
	options?: readonly string[]; // was @options(values)
	multiline?: boolean; // was @multiline
};
```

This **unifies** the four existing field decorators (`@required`, `@file`,
`@options`, `@multiline`) into one options bag, so a field declares everything in a
single `@serialize({ … })` instead of a decorator stack. Bare fields are
`@serialize()` (called form, required to accept the optional arg).

### 3.3 The mark _is_ the (de)serializer — no custom codec in the core

The set of `@serialize`-marked fields **plus** "reconstruct via zero-arg ctor +
assign those fields" **is** a complete, _derived_ (de)serializer. A hand-written
adapter is the same spec written imperatively (serde `derive` vs `impl Serialize`;
Bevy derived `Reflect` vs `reflect_value`). They are the derived-vs-manual ends of
**one** mechanism, not two.

Every current type — all components _and_ `Vector2`/`Angle`/`FontSettings` — has a
zero-arg-capable ctor and plain assignable fields, so **all of them field-walk**.
`Vector2`'s existing adapter (`encode: v => ({x,y})`) is an artefact of the old
two-track design; field-walking produces identical output. **No custom codec
exists anywhere in the codebase as it stands.**

Therefore: **no adapter in the core design.** It remains a _latent_ escape hatch —
an optional overload on the underlying `registerSerializable` function — to be
added only when a genuinely opaque type appears (representation differs from fields;
a foreign/non-class type like `Map`/`Date`; or a ctor with reconstruction
invariants that field-assignment would bypass). YAGNI until then.

### 3.4 The static guarantee falls out of the mark — zero double bookkeeping

`@serialize` is typed so that marking an un-encodable field is a **compile error at
the field's own line**:

```ts
const serialize =
	(opts?: SerializeOptions) =>
	<V extends SerializableValue>(
		_v: undefined,
		ctx: ClassFieldDecoratorContext<unknown, V>,
	): void => {
		/* push ctx.name + opts into ctx.metadata */
	};
```

`@serialize() story: Story` fails to compile (`Story` is not assignable to
`SerializableValue`). The single act of marking a field is _also_ the check — no
parallel type-level list, no `Transient<T>` wrapper, no remembering to annotate the
type separately. Verified to survive the factory (`@serialize({...})`) form.

`SerializableValue` is the recursive union of: primitives, arrays/records of
`SerializableValue`, and **branded value types**. Each value type declares the
brand once (`declare readonly [VALUE_TYPE]: true`, phantom — no runtime cost);
forgetting it makes `@serialize`-ing that type a compile error, which fails safe.

### 3.5 Foreign / non-class types

A decorator can only attach to a class or its members. Primitives and plain
objects/arrays need no marking (encoded structurally). The only remaining case —
foreign types you don't own and can't decorate — is handled by the **registration
function** the decorator is sugar over: `registerSerializable(ctor, "Name")` (with
the future optional adapter overload from §3.3). serde (remote derive) and Bevy
(`register_type`) do exactly this.

## 4. What an author writes (before → after)

```ts
// before (opt-out + stacked field decorators)
@serializable("FontSettings")
class FontSettings {
	@required @file(".ttf,.otf,.woff,.woff2,.font.zip") font: string;
	family: string;
	@options(fontStyleLabels) variant: FontStyleLabel;
}
@valueType({
	encode: (v) => ({ x: v.x, y: v.y }),
	decode: (r) => new Vector2(r.x, r.y),
})
class Vector2 {
	/* … */
}
@serializable("InkStory")
class InkStoryComponent {
	@skip() story: Story | null = null;
	state = "";
}

// after (opt-in, one decorator, marks carry metadata, no adapter)
@serializable("FontSettings")
class FontSettings implements ValueType {
	declare readonly [VALUE_TYPE]: true;
	@serialize({
		required: true,
		file: ".ttf,.otf,.woff,.woff2,.font.zip",
	})
	font = "";
	@serialize() family = "";
	@serialize({ options: fontStyleLabels }) variant: FontStyleLabel =
		"Regular";
}
@serializable("Vector2")
class Vector2 implements ValueType {
	declare readonly [VALUE_TYPE]: true;
	constructor(
		public x = 0,
		public y = 0,
	) {} // field-walked, no adapter
}
@serializable("InkStory")
class InkStoryComponent {
	@serialize() state = "";
	story: Story | null = null; // unmarked → inert → safe
}
```

`PhysicsBodyComponent` honestly gets noisier (~15 `@serialize()` lines) — that's
the accepted opt-in tax, uniform and type-safe.

## 5. Build order

1. **Spike-confirm the factory-form constraint in-repo** (5 min) — already verified
   in throwaway spikes; re-confirm against the final `SerializableValue` definition
   before relying on it.
2. **Add `"esnext.decorators"` to `lib`** in `tsconfig.app.json`. Good hygiene
   regardless; the codebase already uses decorator metadata. (With the class
   decorator collecting at decoration time, nothing reads `ctor[Symbol.metadata]`
   back, so this is no longer load-bearing — but include it.)
3. **Core types & registry** — `SerializableValue`, the `ValueType` brand, the
   unified registry (`name → { ctor, fields, options }`), `registerSerializable`.
4. **`@serializable` (class)** — collect `serializedFields` + per-field `options`
   from `context.metadata`; register `name → ctor`. Replace existing `@serializable`
   and `@valueType` usages.
5. **`@serialize(options?)` (field)** — the typed marker from §3.4; subsumes
   `@required`/`@file`/`@options`/`@multiline`.
6. **Serializer/deserializer** — walk **marked** fields; field-walk reconstruction
   (zero-arg ctor + assign). Keep `$type` for nested values; keep the entity
   component-map keying for top-level components.
7. **Migrate every `@serializable` component + every value type** — add `@serialize()`
   marks; drop `@skip`, `@valueType` adapters (`Vector2`!), and the stacked field
   decorators. `@skip`-as-runtime-derived → simply unmark.
8. **Update the editor consumers** — `value-renderers`/`inspector`/`register-renderers`
   read field presentation from the unified `options` metadata instead of the old
   per-field decorator maps (`isFileField`/`fieldEnum`/`isMultilineField`/
   `isRequiredField`).
9. **Delete dead machinery** — `field-enums.ts` (`@skip`/`@required`/`@file`/
   `@options`/`@multiline` collectors), `value-type.ts`/`value-type-registry.ts`
   if fully subsumed.
10. `bun check` + a serialize→deserialize round-trip over the demo level + an
    editor smoke test (inspector renders file/enum/required/multiline correctly).

## 6. Risks / open detail

- **Constraint through the factory form** — verified, but it's the load-bearing TS
  behavior; step 1 re-confirms it against the real types before the migration leans
  on it. If it ever regressed, fall back to a bare `@serialize` for the constraint.
- **Error message quality** — the rejection surfaces as a wrapped `TS1240` ("Unable
  to resolve signature of property decorator…"); the useful line names the field and
  `SerializableValue`. Functional, not pretty. A _dev-time_ (never player-facing)
  editor validation pass over the registry could complement it later — but any such
  surfacing is a **UX decision to raise with the user**, not to assume.
- **Ctor-derived invariants** — field-walk reconstruction bypasses ctor logic
  (`new Ctor()` then assign). Fine for the pure-data types we have; the adapter
  escape hatch (§3.3) is the answer if such a type ever needs serializing.
- **Value-type brand drift** — the runtime registration and the type-level brand are
  separate; a missing brand is a _compile_ error on first `@serialize` of that type,
  so it fails safe.
