import { Toast } from "@base-ui/react/toast";

/** A base-ui toast manager, one per editor window. */
export type WindowToastManager = ReturnType<
	typeof Toast.createToastManager
>;

type ToastAddOptions = Parameters<WindowToastManager["add"]>[0];

const managers = new Map<string, WindowToastManager>();
let focusedWindowId: string | null = null;
let hubWindowId: string | null = null;

/**
 * Create and register a toast manager for a window. Each window's `<Toaster>`
 * owns one; the first registered window becomes the fallback hub for toasts
 * triggered by background events with no focused window.
 */
export const createWindowToastManager = (
	windowId: string,
): WindowToastManager => {
	const manager = Toast.createToastManager();
	managers.set(windowId, manager);
	if (hubWindowId === null) {
		hubWindowId = windowId;
	}
	return manager;
};

/** Deregister a window's toast manager when its `<Toaster>` unmounts. */
export const releaseWindowToastManager = (windowId: string): void => {
	managers.delete(windowId);
	if (focusedWindowId === windowId) {
		focusedWindowId = null;
	}
	if (hubWindowId === windowId) {
		hubWindowId = managers.keys().next().value ?? null;
	}
};

/**
 * Record which window currently has OS focus. Toasts with no explicit target
 * render here, so background events surface in the window the user is looking
 * at.
 */
export const setFocusedToastWindow = (
	windowId: string | null,
): void => {
	focusedWindowId = windowId;
};

const resolveManager = (
	target?: string,
): WindowToastManager | undefined => {
	if (target !== undefined) {
		const targeted = managers.get(target);
		if (targeted) {
			return targeted;
		}
	}
	if (focusedWindowId !== null) {
		const focused = managers.get(focusedWindowId);
		if (focused) {
			return focused;
		}
	}
	if (hubWindowId !== null) {
		const hub = managers.get(hubWindowId);
		if (hub) {
			return hub;
		}
	}
	return managers.values().next().value;
};

/**
 * Add a toast to a window's toaster. Routes to `target` when given, else the
 * focused window, else the hub. No-op if no `<Toaster>` is mounted.
 */
export const toast = (
	options: ToastAddOptions,
	target?: string,
): string | undefined => resolveManager(target)?.add(options);

/**
 * Show an error toast. Routes like {@link toast}: `target` window first, then
 * the focused window, then the hub.
 */
export const toastError = (title: string, target?: string): void => {
	toast({ title, type: "error" }, target);
};

/**
 * Window-agnostic facade over the routed managers, exposing the base-ui
 * manager surface used outside React (e.g. the zoom toast). Calls resolve to
 * the focused window's manager, with the hub as fallback.
 */
export const toastManager: Pick<
	WindowToastManager,
	"add" | "close" | "update"
> = {
	add: (options) => resolveManager()?.add(options) ?? "",
	close: (id) => resolveManager()?.close(id),
	update: (id, updates) => resolveManager()?.update(id, updates),
};
