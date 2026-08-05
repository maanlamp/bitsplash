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
 * Observation only — a plugin cannot displace a host's input. Injecting input
 * belonged to a scripted-input probe that was built, measured and dropped
 * because its runs diverged; reproduction lives in headless fixtures instead.
 *
 * @example
 * registerHostPlugin({ onSceneChanged: (id, world) => record(id, world) });
 */
export const registerHostPlugin = (plugin: HostPlugin): void => {
	registered.push(plugin);
};

/** The externally registered plugins, in registration order. */
export const registeredHostPlugins = (): ReadonlyArray<HostPlugin> =>
	registered;
