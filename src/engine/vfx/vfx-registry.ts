import {
	type VfxCatalog,
	type VfxDef,
	validateVfxCatalog,
} from "./vfx-def";

/**
 * The engine's single VFX effect catalog.
 *
 * Particles are engine functionality but effects are authored *content*, so the
 * game registers its catalog as a load-time side effect and the engine — and
 * the editor, through the same import order — reads it back from here. Scene
 * loading never sees a `GameModule`, which is why this is a module registry
 * rather than a service.
 *
 * Registration **replaces** rather than latches, which is what makes Vite hot
 * reload free: an authored `*.vfx.json` change re-runs the game's registration
 * module, the new catalog lands here, and the VFX update system notices the def
 * objects it is holding are stale and rebuilds its pools on the next frame. The
 * game side owns the `import.meta.glob` sweep and its `import.meta.hot.accept`;
 * nothing here knows about Vite, so tests can register the committed artifacts
 * with plain static imports.
 *
 * No catalog registered is a supported state: {@link hasVfxDefs} is `false` and
 * the VFX systems no-op, so engine-only tests and bare worlds keep booting.
 */
let catalog: VfxCatalog | null = null;

/**
 * Validate and install the catalog, replacing whatever was registered before.
 * Throws with the source named on any content problem — an unknown key, a
 * negative rate, an emitter that emits nothing, a dangling `onDeath`, a pool
 * blown past the particle ceiling, too many render slots.
 *
 * @example
 * registerVfxCatalog([rainJson, splashJson], "src/game/content/vfx");
 */
export const registerVfxCatalog = (
	authored: ReadonlyArray<unknown>,
	source: string,
): void => {
	catalog = validateVfxCatalog(authored, source);
};

/** Return to the no-effects state. Test hygiene; nothing ships calling it. */
export const clearVfxCatalog = (): void => {
	catalog = null;
};

/** Whether any effect is registered. `false` means the VFX systems no-op. */
export const hasVfxDefs = (): boolean => catalog !== null;

/**
 * The def an id names.
 *
 * A dangling id throws rather than returning null: the id came from authored
 * scene data or a spawn call site, so silently drawing nothing would hide a
 * renamed effect behind an invisible one. The throw lands on the first frame
 * the emitter is stepped.
 */
export const resolveVfxDef = (id: string): VfxDef => {
	if (!catalog) {
		throw new Error(
			`VFX: no effect catalog is registered, so effect "${id}" cannot resolve. Guard VFX work with hasVfxDefs(), or register a catalog (see game/registrations.ts).`,
		);
	}
	const def = catalog.defs.get(id);
	if (!def) {
		throw new Error(
			`VFX: effect "${id}" is not in the registered catalog. Known effects: ${[...catalog.defs.keys()].join(", ")}.`,
		);
	}
	return def;
};

/** Every registered effect id, for authoring surfaces. Empty with no catalog. */
export const vfxDefIds = (): readonly string[] =>
	catalog ? [...catalog.defs.keys()] : [];
