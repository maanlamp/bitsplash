/**
 * Process-global signal reporting whether any dirty-guard ("Keep editing /
 * Discard") dialog is currently open, in any window. The editor's per-window
 * frame loops consult this to pause the sim while a guard is up (plan line 151:
 * "The sim pauses while any guard dialog is open"). The signal lives in the one
 * shared JS heap, so a guard raised in a satellite is visible to every window's
 * loop.
 *
 * The dialog owner ({@link import("../app")} `App`) is the sole writer via
 * {@link setGuardDialogOpen}; readers use {@link isGuardDialogOpen} (imperative,
 * e.g. inside a rAF loop) or {@link subscribeGuardDialog} (to react to changes).
 *
 * @example
 * // In a frame loop (WS-F run worker):
 * if (!isGuardDialogOpen()) host.frame(dt, now);
 *
 * @example
 * // Reacting to changes:
 * const unsub = subscribeGuardDialog(() => setPaused(isGuardDialogOpen()));
 */
let open = false;
const listeners = new Set<() => void>();

/** Whether a dirty-guard dialog is currently open in any window. */
export const isGuardDialogOpen = (): boolean => open;

/**
 * Set the guard-open signal and notify subscribers. No-op if unchanged. Called
 * by the dialog owner whenever the set of pending guards becomes (non-)empty.
 */
export const setGuardDialogOpen = (next: boolean): void => {
	if (open === next) {
		return;
	}
	open = next;
	for (const listener of listeners) {
		listener();
	}
};

/**
 * Subscribe to guard-open changes. Returns an unsubscribe function. The callback
 * fires after {@link isGuardDialogOpen} already reflects the new value.
 */
export const subscribeGuardDialog = (
	listener: () => void,
): (() => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
