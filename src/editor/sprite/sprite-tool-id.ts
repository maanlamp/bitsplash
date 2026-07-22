/**
 * The canonical list of sprite-editor tool ids. This is the single source of
 * truth: the registry is keyed by these ids and {@link SpriteToolId} is derived
 * from the tuple, so adding a tool is a one-line edit here plus a registry entry
 * — and referencing a tool that does not exist is a type error rather than a
 * silent runtime miss.
 *
 * @example
 * ```ts
 * const id: SpriteToolId = "brush"; // ok
 * const bad: SpriteToolId = "smudge"; // type error until "smudge" is added here
 * ```
 */
export const SPRITE_TOOL_IDS = [
	"brush",
	"eraser",
	"line",
	"rectangle",
	"ellipse",
	"fill",
	"dither",
	"gradient",
	"scatter",
	"custom-brush",
	"marquee",
	"lasso",
	"wand",
	"move",
	"transform",
	"eyedropper",
	"attachment",
	"pan",
] as const;

/**
 * A registry-keyed tool id. Never a bare `string`: unknown ids are
 * unrepresentable, so tool state, dispatch, and keybinds stay exhaustive as the
 * toolset grows toward the planned ~20 tools.
 */
export type SpriteToolId = (typeof SPRITE_TOOL_IDS)[number];
