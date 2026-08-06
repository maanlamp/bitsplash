import type { HostPlugin } from "./host";

const registered: Array<HostPlugin> = [];

/**
 * Attach `plugin` to every {@link import("./host").Host} constructed from now
 * on, for a composition layer that has no other way to reach them.
 *
 * A seam, not a switch: nothing in the app calls this, so the list is empty and
 * a host behaves exactly as its own options say. It exists so a module the build
 * never includes can observe the running app without the app carrying a branch
 * for it.
 *
 * A plugin may also overlay the sampled input via
 * {@link import("./host").HostPlugin.interceptInput}, so a QA script can drive
 * the real path — normaliser, dispatcher, focus resolution, activation — rather
 * than reaching past the UI to call handlers directly. This previously said
 * observation only, on the grounds that an earlier scripted-input probe's runs
 * diverged. That was a finding about the determinism of *batching counters*, and
 * it does not generalise: frame-interval and playability checks do not need
 * bit-identical runs, and driving real input is the one thing headless fixtures
 * cannot do. A build that passes every fixture can still be unplayable.
 *
 * Deterministic per-frame reproduction still belongs in headless fixtures.
 *
 * @example
 * registerHostPlugin({ onSceneChanged: (id, world) => record(id, world) });
 * registerHostPlugin({ interceptInput: (input) => withKeysHeld(input, ["ENTER"]) });
 */
export const registerHostPlugin = (plugin: HostPlugin): void => {
	registered.push(plugin);
};

/** The externally registered plugins, in registration order. */
export const registeredHostPlugins = (): ReadonlyArray<HostPlugin> =>
	registered;
