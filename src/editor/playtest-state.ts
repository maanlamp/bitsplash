/**
 * Editor-global playtest launch state (WS-F). The separate game process's
 * lifecycle is owned by the Electron main process, which broadcasts every phase
 * change; this module mirrors that phase into the shared renderer heap so the
 * global playtest icon on every window reflects one source of truth.
 *
 * It is a tiny external store: {@link subscribePlaytest} + {@link getPlaytestPhase}
 * feed a `useSyncExternalStore`, and {@link launchPlaytest} fires the launch.
 * Outside the desktop shell (no bridge) the phase is permanently `"idle"`.
 */
export type PlaytestPhase = "idle" | "launching" | "running";

/**
 * The preload bridge (`window.gamePlaytest`) main exposes for the editor-global
 * playtest. Absent when the editor runs outside the Electron shell.
 */
type PlaytestBridge = Readonly<{
	launch: () => Promise<unknown>;
	read: () => Promise<PlaytestPhase>;
	onStateChanged: (
		listener: (phase: PlaytestPhase) => void,
	) => () => void;
}>;

const bridge = (): PlaytestBridge | undefined =>
	(globalThis as { gamePlaytest?: PlaytestBridge }).gamePlaytest;

let phase: PlaytestPhase = "idle";
let bound = false;
const listeners = new Set<() => void>();

const setPhase = (next: PlaytestPhase): void => {
	if (phase === next) {
		return;
	}
	phase = next;
	for (const listener of listeners) {
		listener();
	}
};

/**
 * Attach to the main-process broadcast on first subscription: read the current
 * phase for an initial sync, then track every change. Idempotent — the single
 * subscription serves every window's icon, since all share this heap.
 */
const bind = (): void => {
	if (bound) {
		return;
	}
	bound = true;
	const api = bridge();
	if (!api) {
		return;
	}
	void api.read().then(setPhase);
	api.onStateChanged(setPhase);
};

/** Subscribe to playtest-phase changes. Returns an unsubscribe function. */
export const subscribePlaytest = (
	listener: () => void,
): (() => void) => {
	bind();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

/** The current playtest phase (`"idle"` when no desktop bridge is present). */
export const getPlaytestPhase = (): PlaytestPhase => phase;

/**
 * Trigger a playtest launch. Main dedupes (ignores the request unless the phase
 * is idle) and broadcasts the resulting phase; the returned promise rejects only
 * when a fresh launch dies before the game reports ready, so the caller can toast.
 */
export const launchPlaytest = async (): Promise<void> => {
	await bridge()?.launch();
};
