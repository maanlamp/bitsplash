/**
 * Whether the host window currently has OS focus.
 *
 * Ambient audio follows the *window*, not whichever panel inside it holds focus.
 * The editor steps only its focused scene view, so panel-level focus is far too
 * twitchy a signal to gate sound on — hovering a toolbar button would duck the
 * weather. Alt-tabbing away is the moment a user expects quiet.
 *
 * Listeners are installed once, lazily, and only where a DOM exists, so importing
 * this module is safe under Bun.
 *
 * @example
 * voice.set({ gain: windowHasFocus() ? mix.gain : 0, ramp: 0.1 });
 */

let focused = true;
let installed = false;
const listeners = new Set<(focused: boolean) => void>();

const announce = (next: boolean): void => {
	if (focused === next) {
		return;
	}
	focused = next;
	for (const listener of listeners) {
		listener(next);
	}
};

const install = (): void => {
	if (installed || typeof window === "undefined") {
		return;
	}
	installed = true;
	focused = document.hasFocus();
	window.addEventListener("focus", () => announce(true));
	window.addEventListener("blur", () => announce(false));
};

/** Whether the host window has OS focus. `true` where there is no window at all. */
export const windowHasFocus = (): boolean => {
	install();
	return focused;
};

/**
 * Subscribe to OS focus changes. Returns an unsubscribe.
 *
 * Fires only on a change, so a subscriber can ramp rather than poll.
 */
export const onWindowFocusChange = (
	listener: (focused: boolean) => void,
): (() => void) => {
	install();
	listeners.add(listener);
	return () => listeners.delete(listener);
};
