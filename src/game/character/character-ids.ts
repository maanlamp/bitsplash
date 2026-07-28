/**
 * Every character that can speak, bark or be portrayed.
 *
 * This tuple is the single source of speaker identity. Ink `# speaker:` tags
 * carry these ids verbatim (`# speaker: bramble`, never a display name), and
 * `scripts/gen-ink.ts` validates every tag against this list at `bun run gen`
 * so a dangling speaker fails the build rather than rendering as a blank name.
 *
 * Display names live on {@link CharacterDescriptor}, not here — `stranger`
 * displays as "Stranger" and `pennywhistle` as "Sergeant Pennywhistle".
 */
export const CHARACTER_IDS = [
	"player",
	"bramble",
	"pennywhistle",
	"quartermaster",
	"quickfoot",
	"stranger",
	"critter",
	"raider",
	"signpost",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

const CHARACTER_ID_SET: ReadonlySet<string> = new Set(CHARACTER_IDS);

/**
 * Narrows an untrusted string — an ink tag value, an authored table entry — to a
 * {@link CharacterId}.
 *
 * @example
 * const id = isCharacterId(tag) ? tag : undefined;
 */
export const isCharacterId = (value: string): value is CharacterId =>
	CHARACTER_ID_SET.has(value);
