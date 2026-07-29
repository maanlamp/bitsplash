import { VfxRenderSystem } from "./vfx-render-system";
import { VfxStore } from "./vfx-store";
import { VfxUpdateSystem } from "./vfx-update-system";

/** A world's VFX systems and the store they share. */
export type VfxSystems = Readonly<{
	update: VfxUpdateSystem;
	render: VfxRenderSystem;
	/**
	 * The shared run-state, exposed so effect code can fire one-shots
	 * (`store.spawnBurst(...)`) without reaching into a system.
	 */
	store: VfxStore;
}>;

/**
 * Build a world's VFX update/render pair over **one** shared
 * {@link VfxStore}, extending the decorations sharing pattern across the update
 * and render lists.
 *
 * Call it once per composition and place the members into that composition's
 * lists: `update` belongs in `ambientSystems()` — which the shipped game spreads
 * after `gameplaySystems` and the editor's edit composition spreads for live
 * authoring preview — and `render` in the render list. Never put `update` in
 * `editWorldSystems`, which the game composition also spreads: VFX would
 * double-step, at the wrong position.
 *
 * One pair per world is not a convention but a checked invariant: the update
 * system claims `ecs.onDestroy(EmitterComponent)` and throws if another owner
 * already holds it.
 *
 * @param seed Pinned PRNG seed for the store. Omit outside tests.
 *
 * @example
 * const vfx = createVfxSystems();
 * return { update: [...ambientSystems(vfx.update)], render: [...renderSystems(), vfx.render] };
 */
export const createVfxSystems = (seed?: number): VfxSystems => {
	const store = new VfxStore(seed);
	return {
		update: new VfxUpdateSystem(store),
		render: new VfxRenderSystem(store),
		store,
	};
};
